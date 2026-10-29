"""
Génère public/data/season.json : forces des équipes, pronostics de l'IA,
résultats et contexte de la prochaine journée de Ligue 1.

Deux modes :
  python scripts/build_data.py --demo
      Saison simulée (données fictives) pour tester l'app sans source de données.

  python scripts/build_data.py --real
      Vrais matchs de Ligue 1, lus dans data/raw/ (voir scripts/fetch_data.py) :
      résultats de la saison, saison précédente si présente, matchs de la semaine.

Le modèle : chaque équipe a une force d'attaque et une faiblesse défensive.
Buts attendus de l'équipe à domicile = exp(mu + avantage_domicile + attaque_dom + defense_ext).
Le nombre de buts suit une loi de Poisson. Avec les vraies données, l'IA apprend à la fois
des buts marqués et des xG (la qualité des occasions), plus stables que le score seul. Les paramètres sont estimés par
maximum de vraisemblance, avec une pénalité qui les ramène vers la moyenne
(utile en début de saison, quand on a peu de matchs).

Le bilan est honnête : chaque journée est prédite UNIQUEMENT avec les matchs
joués avant elle (validation « walk-forward »).
"""

import argparse
import csv
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "season.json"

TEAMS = {
    "PSG": ("Paris Saint-Germain", "#1B3A8C"),
    "MON": ("Monaco", "#D62828"),
    "OM": ("Marseille", "#2A9FD6"),
    "OL": ("Lyon", "#C8102E"),
    "LIL": ("Lille", "#B5121B"),
    "LEN": ("Lens", "#E8A317"),
    "REN": ("Rennes", "#A3161B"),
    "NIC": ("Nice", "#B01E23"),
    "STR": ("Strasbourg", "#1C5DA8"),
    "BRE": ("Brest", "#D7263D"),
    "TOU": ("Toulouse", "#5B2C83"),
    "PFC": ("Paris FC", "#1D2A4D"),
    "LOR": ("Lorient", "#F07F1A"),
    "ANG": ("Angers", "#2B2B2B"),
    "AUX": ("Auxerre", "#2563A6"),
    "HAV": ("Le Havre", "#3F7CC0"),
    "LMA": ("Le Mans", "#C8102E"),
    "TRO": ("Troyes", "#1F5FA8"),
}

# Correspondance des noms football-data.co.uk vers nos codes.
CSV_NAMES = {
    "Paris SG": "PSG", "Monaco": "MON", "Marseille": "OM", "Lyon": "OL",
    "Lille": "LIL", "Lens": "LEN", "Rennes": "REN", "Nice": "NIC",
    "Strasbourg": "STR", "Brest": "BRE", "Toulouse": "TOU", "Paris FC": "PFC",
    "Lorient": "LOR", "Angers": "ANG", "Auxerre": "AUX", "Le Havre": "HAV",
    "Le Mans": "LMA", "Troyes": "TRO",
}

PENALTY = 3.0
DECAY = 0.06       # les matchs récents comptent plus (par journée d'écart)
XG_WEIGHT = 0.4    # part des xG dans ce que l'IA apprend (le reste : les buts réels)
PREV_WEIGHT = 0.5  # poids supplémentaire des matchs de la saison précédente


# ---------------------------------------------------------------- modèle

def fit(matches, teams, current_md):
    """Estime mu, avantage domicile, attaque et défense par équipe."""
    teams = list(dict.fromkeys(list(teams) + [t for m in matches for t in (m["home"], m["away"])]))
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    if not matches:
        return {"mu": math.log(1.3), "home": 0.22,
                "att": {t: 0.0 for t in teams}, "def": {t: 0.0 for t in teams}}

    h = np.array([idx[m["home"]] for m in matches])
    a = np.array([idx[m["away"]] for m in matches])
    def target(m, g, xg):
        return m[g] if m.get(xg) is None else (1 - XG_WEIGHT) * m[g] + XG_WEIGHT * m[xg]

    hg = np.array([target(m, "hg", "xgH") if m.get("xgH") is not None else m["hg"] for m in matches], dtype=float)
    ag = np.array([target(m, "ag", "xgA") if m.get("xgA") is not None else m["ag"] for m in matches], dtype=float)
    w = np.array([m.get("w0", 1.0) * math.exp(-DECAY * (current_md - m["md"])) for m in matches])

    def nll(p):
        mu, home = p[0], p[1]
        att, dfn = p[2:2 + n], p[2 + n:]
        lh = np.exp(mu + home + att[h] + dfn[a])
        la = np.exp(mu + att[a] + dfn[h])
        ll = w * (hg * np.log(lh) - lh + ag * np.log(la) - la)
        reg = PENALTY * (np.sum(att ** 2) + np.sum(dfn ** 2)) + 5.0 * (home - 0.22) ** 2
        return -ll.sum() + reg

    x0 = np.zeros(2 + 2 * n)
    x0[0], x0[1] = math.log(1.3), 0.22
    res = minimize(nll, x0, method="L-BFGS-B")
    p = res.x
    return {
        "mu": float(p[0]), "home": float(p[1]),
        "att": {t: float(p[2 + i]) for t, i in idx.items()},
        "def": {t: float(p[2 + n + i]) for t, i in idx.items()},
    }


def expected_goals(params, home, away):
    lh = math.exp(params["mu"] + params["home"] + params["att"][home] + params["def"][away])
    la = math.exp(params["mu"] + params["att"][away] + params["def"][home])
    return lh, la


def markets(lh, la, max_goals=8):
    gh = poisson.pmf(range(max_goals + 1), lh)
    ga = poisson.pmf(range(max_goals + 1), la)
    m = np.outer(gh, ga)
    m /= m.sum()
    ph = float(np.tril(m, -1).sum())
    pd = float(np.trace(m))
    pa = float(np.triu(m, 1).sum())
    over = float(sum(m[i, j] for i in range(max_goals + 1)
                     for j in range(max_goals + 1) if i + j > 2))
    btts = float((1 - gh[0]) * (1 - ga[0]))
    return [ph, pd, pa], over, btts


def r(x, d=3):
    return round(float(x), d)


# ---------------------------------------------------------------- démo

def round_robin(codes, rng):
    """Calendrier aller (17 journées) par la méthode du cercle."""
    teams = codes[:]
    rng.shuffle(teams)
    rounds = []
    for k in range(len(teams) - 1):
        pairs = []
        for i in range(len(teams) // 2):
            t1, t2 = teams[i], teams[-1 - i]
            pairs.append((t1, t2) if (k + i) % 2 == 0 else (t2, t1))
        rounds.append(pairs)
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]
    return rounds


def simulate_match(lh, la, rng):
    """Simule un match minute par minute, avec possible carton rouge."""
    red_h = rng.randint(15, 85) if rng.random() < 0.07 else None
    red_a = rng.randint(15, 85) if rng.random() < 0.07 else None
    goals = []
    for minute in range(1, 91):
        mh, ma = 1.0, 1.0
        if red_h and minute > red_h:
            mh, ma = mh * 0.7, ma * 1.35
        if red_a and minute > red_a:
            mh, ma = mh * 1.35, ma * 0.7
        if rng.random() < lh * mh / 90:
            goals.append(("H", minute))
        if rng.random() < la * ma / 90:
            goals.append(("A", minute))
    hg = sum(1 for g in goals if g[0] == "H")
    ag = sum(1 for g in goals if g[0] == "A")
    hth = sum(1 for g in goals if g[0] == "H" and g[1] <= 45)
    hta = sum(1 for g in goals if g[0] == "A" and g[1] <= 45)
    return {"hg": hg, "ag": ag, "htH": hth, "htA": hta,
            "redH": red_h, "redA": red_a, "goals": [[s, m] for s, m in goals]}


def market_odds(true_p, rng, margin=1.06):
    """Cotes simulées : la vraie probabilité + un peu de bruit + la marge du bookmaker."""
    noisy = np.array(true_p) * np.exp(np.array([rng.gauss(0, 0.06) for _ in range(3)]))
    noisy /= noisy.sum()
    return [round(1 / (p * margin), 2) for p in noisy]


def build_demo(seed=2026):
    rng = random.Random(seed)
    codes = list(TEAMS)
    # Forces cachées (fictives) qui « génèrent » la saison simulée.
    tiers = [0.45, 0.30, 0.25, 0.22, 0.20, 0.18, 0.12, 0.08, 0.06,
             0.02, 0.0, -0.04, -0.08, -0.12, -0.15, -0.20, -0.22, -0.25]
    true = {"mu": math.log(1.3), "home": 0.24, "att": {}, "def": {}}
    for code, t in zip(codes, tiers):
        true["att"][code] = t + rng.gauss(0, 0.06)
        true["def"][code] = -t * 0.8 + rng.gauss(0, 0.06)

    rounds = round_robin(codes, rng)
    dates = ["2026-08-22", "2026-08-29", "2026-09-12", "2026-09-19", "2026-09-26",
             "2026-10-03", "2026-10-17", "2026-10-25", "2026-10-31"]
    last_md = 8
    played = []
    for md in range(1, last_md + 1):
        for home, away in rounds[md - 1]:
            lh, la = expected_goals(true, home, away)
            res = simulate_match(lh, la, rng)
            true_p, _, _ = markets(lh, la)
            played.append({"md": md, "date": dates[md - 1], "home": home, "away": away,
                           **res, "odds": market_odds(true_p, rng)})

    strongest = sorted(codes, key=lambda c: -true["att"][c] + true["def"][c])[:4]
    upcoming = []
    for home, away in rounds[last_md]:
        lh, la = expected_goals(true, home, away)
        true_p, _, _ = markets(lh, la)
        upcoming.append({
            "md": last_md + 1, "date": dates[last_md], "home": home, "away": away,
            "odds": market_odds(true_p, rng),
            "ctx": {
                "absH": absences(rng), "absA": absences(rng),
                "europeH": home in strongest, "europeA": away in strongest,
                "weather": rng.choices(["beau", "pluie", "vent"], [0.65, 0.25, 0.10])[0],
            },
        })
    return played, upcoming, "demo"


def absences(rng):
    out = []
    if rng.random() < 0.28:
        out.append("buteur")
    if rng.random() < 0.10:
        out.append("gardien")
    if rng.random() < 0.15:
        out.append("defenseur")
    return out


# ---------------------------------------------------------------- vraies données

RAW = ROOT / "data" / "raw"


def num(row, key, cast=float):
    v = (row.get(key) or "").strip()
    try:
        return cast(v) if v else None
    except ValueError:
        return None


def parse_date(s_):
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s_.strip(), fmt)
        except ValueError:
            pass
    raise ValueError(s_)


def read_results(path, known_only):
    """Lit un fichier de résultats et numérote les journées par équipe."""
    rows = [r_ for r_ in csv.DictReader(open(path, encoding="utf-8-sig")) if r_.get("HomeTeam")]
    rows.sort(key=lambda r_: parse_date(r_["Date"]))
    count = {}
    out = []
    for row in rows:
        hg, ag = num(row, "FTHG", int), num(row, "FTAG", int)
        if hg is None or ag is None:
            continue
        home = CSV_NAMES.get(row["HomeTeam"], row["HomeTeam"])
        away = CSV_NAMES.get(row["AwayTeam"], row["AwayTeam"])
        if known_only and (home not in TEAMS or away not in TEAMS):
            continue
        # Journée = nombre de matchs déjà joués par l'équipe qui en a joué le plus, + 1.
        md = max(count.get(home, 0), count.get(away, 0)) + 1
        count[home] = count.get(home, 0) + 1
        count[away] = count.get(away, 0) + 1
        oh, od, oa = num(row, "AvgH"), num(row, "AvgD"), num(row, "AvgA")
        out.append({
            "md": md, "date": parse_date(row["Date"]).strftime("%Y-%m-%d"),
            "home": home, "away": away, "hg": hg, "ag": ag,
            "htH": num(row, "HTHG", int), "htA": num(row, "HTAG", int),
            "xgH": num(row, "HxG"), "xgA": num(row, "AxG"),
            "sotH": num(row, "HST", int), "sotA": num(row, "AST", int),
            "redH": 1 if (num(row, "HR", int) or 0) > 0 else None,
            "redA": 1 if (num(row, "AR", int) or 0) > 0 else None,
            "goals": None,
            "odds": [oh, od, oa] if oh and od and oa else None,
        })
    return out


def paris_time(t):
    """Les heures de la source sont celles du Royaume-Uni : Paris a toujours une heure de plus."""
    t = (t or "").strip()
    if not t:
        return None
    h, m = t.split(":")[:2]
    return f"{(int(h) + 1) % 24:02d}:{m}"


def build_real():
    """Source principale : OneFootball. Repli : football-data.co.uk si le cache OneFootball manque."""
    of_files = sorted(RAW.glob("onefootball_*.json"))
    if of_files:
        from onefootball_source import build_onefootball
        played, upcoming, fetched = build_onefootball(of_files[-1], RAW)
        build_real.fetched = fetched
        from onefootball_source import OF_NAMES
        cache = json.loads(of_files[-1].read_text(encoding="utf-8"))
        build_real.unknown = {m[s_] for m in cache["matches"].values() if m.get("competition") == "Ligue 1"
                              for s_ in ("home", "away") if m.get(s_) and m[s_] not in OF_NAMES}
        history = []
        seasons = sorted(RAW.glob("F1_*.csv"))
        # Saison précédente (archive football-data.co.uk) pour démarrer le modèle.
        prev = [f for f in seasons if f.stem != "F1_" + of_files[-1].stem.split("_")[1]]
        if prev:
            for m in read_results(prev[-1], known_only=False):
                history.append({**m, "md": m["md"] - 38, "w0": PREV_WEIGHT})
        code = of_files[-1].stem.split("_")[1]
        return played, upcoming, "onefootball", history, f"20{code[:2]}-{code[2:]}"
    seasons = sorted(RAW.glob("F1_*.csv"))
    if not seasons:
        raise SystemExit("Aucun fichier data/raw/F1_*.csv : lance d'abord python scripts/fetch_data.py")
    current = seasons[-1]
    played = read_results(current, known_only=True)

    # La saison précédente aide l'IA à démarrer : poids réduit, et placée « avant » la journée 1.
    history = []
    if len(seasons) > 1:
        for m in read_results(seasons[-2], known_only=False):
            history.append({**m, "md": m["md"] - 38, "w0": PREV_WEIGHT})

    last_md = max((m["md"] for m in played), default=0)
    upcoming = []
    fx = RAW / "fixtures_F1.csv"
    if fx.exists():
        for row in csv.DictReader(open(fx, encoding="utf-8-sig")):
            home, away = CSV_NAMES.get(row["HomeTeam"]), CSV_NAMES.get(row["AwayTeam"])
            if not home or not away:
                continue
            oh, od, oa = num(row, "AvgH"), num(row, "AvgD"), num(row, "AvgA")
            upcoming.append({
                "md": last_md + 1, "date": parse_date(row["Date"]).strftime("%Y-%m-%d"),
                "time": paris_time(row.get("Time")),
                "home": home, "away": away,
                "odds": [oh, od, oa] if oh and od and oa else None,
                # Absences et météo ne sont pas dans la source : à régler avec les leviers.
                "ctx": {"known": False, "absH": [], "absA": [], "europeH": False, "europeA": False, "weather": "inconnu"},
            })
    season = current.stem.split("_")[1]
    label = f"20{season[:2]}-{season[2:]}"
    return played, upcoming, "reel", history, label


# ---------------------------------------------------------------- mesures, leviers, trace

MODEL_KEY = f"v1|{PENALTY}|{DECAY}|{XG_WEIGHT}|{PREV_WEIGHT}"
EVAL_CACHE = RAW / "history" / "eval_cache.json"


def evaluate_cached(played, code):
    """Les mesures prennent une minute : on les réutilise tant que les données n'ont pas changé."""
    import hashlib
    from evaluate import run
    h = hashlib.sha1(MODEL_KEY.encode())
    for f in sorted((RAW / "history").glob("*.json")) + sorted(RAW.glob("F1_*.csv")):
        if f.name not in ("eval_cache.json", "backtest.json"):
            h.update(f.name.encode() + f.read_bytes())
    h.update(json.dumps([(m["date"], m["home"], m["away"], m["hg"], m["ag"], m["pred"]["p"]) for m in played]).encode())
    key = h.hexdigest()
    try:
        cached = json.loads(EVAL_CACHE.read_text(encoding="utf-8"))
        if cached.get("key") == key:
            return cached["eval"]
    except (FileNotFoundError, ValueError):
        pass
    try:
        ev = run(played, code, {"read_results": read_results, "fit": fit, "expected_goals": expected_goals,
                                "markets": markets, "prev_weight": PREV_WEIGHT, "key": MODEL_KEY})
    except Exception as e:  # noqa: BLE001  une mesure ratée ne doit pas bloquer les pronostics
        import traceback
        traceback.print_exc()
        print(f"Mesures indisponibles : {e}")
        return None
    EVAL_CACHE.parent.mkdir(parents=True, exist_ok=True)
    EVAL_CACHE.write_text(json.dumps({"key": key, "eval": ev}, ensure_ascii=False), encoding="utf-8")
    return ev


def publish(m, cfg):
    """Le pronostic tel que l'app l'affiche : modèle + leviers retenus allumés automatiquement."""
    lh, la = m["lh"], m["la"]
    c = m.get("ctx") or {}
    on = []
    cfg = cfg or {}

    def use(name):
        return cfg.get(name, {}).get("kept")
    for side, own_key, other_key in (("H", "lh", "la"), ("A", "la", "lh")):
        x = {"lh": lh, "la": la}
        if use("buteur") and "buteur" in (c.get(f"abs{side}") or []):
            x[own_key] *= cfg["buteur"]["own"]
            x[other_key] *= cfg["buteur"]["other"]
            on.append(f"but{side}")
        if use("coupe") and c.get(f"europe{side}"):
            x[own_key] *= cfg["coupe"]["own"]
            x[other_key] *= cfg["coupe"]["other"]
            on.append(f"eur{side}")
        lh, la = x["lh"], x["la"]
    if use("meteo") and c.get("weather") in ("pluie", "vent"):
        lh, la = lh * cfg["meteo"]["own"], la * cfg["meteo"]["own"]
        on.append("pluie")
    p, over, _ = markets(lh, la)
    return {"lh": r(lh), "la": r(la), "p": [r(x) for x in p], "over25": r(over), "levers": on}


def paris_now():
    from onefootball_source import paris
    return paris(datetime.now(timezone.utc))


# ---------------------------------------------------------------- assemblage

def standings(played, codes):
    tab = {c: {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0, "form": []}
           for c in codes}
    for m in sorted(played, key=lambda x: x["md"]):
        for side, gf, ga in ((m["home"], m["hg"], m["ag"]), (m["away"], m["ag"], m["hg"])):
            t = tab[side]
            t["played"] += 1
            t["gf"] += gf
            t["ga"] += ga
            if gf > ga:
                t["w"] += 1; t["pts"] += 3; t["form"].append("V")
            elif gf == ga:
                t["d"] += 1; t["pts"] += 1; t["form"].append("N")
            else:
                t["l"] += 1; t["form"].append("D")
    order = sorted(codes, key=lambda c: (-tab[c]["pts"], -(tab[c]["gf"] - tab[c]["ga"]), -tab[c]["gf"]))
    for rank, c in enumerate(order, 1):
        tab[c]["rank"] = rank
        tab[c]["form"] = tab[c]["form"][-5:]
    return tab


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--real", action="store_true")
    args = ap.parse_args()

    history, season, fetched_at = [], "2026-27", None
    if args.real:
        played, upcoming, mode, history, season = build_real()
        fetched_at = getattr(build_real, "fetched", None)
    else:
        played, upcoming, mode = build_demo()

    codes = list(TEAMS)
    last_md = max((m["md"] for m in played), default=0)

    # Pronostics « walk-forward » : chaque journée prédite avec le passé seulement.
    for md in range(1, last_md + 1):
        params = fit(history + [m for m in played if m["md"] < md], codes, md)
        for m in played:
            if m["md"] == md:
                lh, la = expected_goals(params, m["home"], m["away"])
                p, over, btts = markets(lh, la)
                m["pred"] = {"lh": r(lh), "la": r(la), "p": [r(x) for x in p],
                             "over25": r(over), "btts": r(btts)}

    params = fit(history + played, codes, last_md + 1)
    for m in upcoming:
        lh, la = expected_goals(params, m["home"], m["away"])
        m["lh"], m["la"] = r(lh), r(la)

    evaluation, checks, health, lever_cfg, live_cfg = None, None, [], None, None
    if args.real and mode == "onefootball":
        from integrity import cross_check, health as health_status, snapshots, model_info
        code = season.replace("20", "", 1).replace("-", "")
        checks = cross_check(played, code, CSV_NAMES, getattr(build_real, "unknown", ()))
        health = health_status()
        evaluation = evaluate_cached(played, code)
        if evaluation and evaluation.get("levers"):
            lever_cfg = {k: {"kept": v["kept"], "own": v["own"] if v["kept"] else 1.0,
                             "other": v["other"] if v["kept"] else 1.0, "measuredOwn": v["own"],
                             "n": v["n"], "nTest": v["nTest"], "gain": v["gain"]}
                         for k, v in evaluation["levers"].items()}
        if evaluation and evaluation.get("live"):
            live_cfg = {"params": evaluation["live"]["params"], "dur": evaluation["live"]["dur"], "used": evaluation["live"]["used"]}
        for m in upcoming:
            m["published"] = publish(m, lever_cfg)
        snapshots(upcoming, played, code, paris_now(), model_info(params), fetched_at)

    tab = standings(played, codes)
    teams = {}
    for c in codes:
        name, color = TEAMS[c]
        teams[c] = {"name": name, "short": c, "color": color,
                    "att": r(params["att"][c]), "def": r(params["def"][c]), **tab[c]}

    data = {
        "meta": {"mode": mode, "season": season, "source": {"reel": "football-data.co.uk", "onefootball": "OneFootball et la presse spécialisée"}.get(mode),
                 "lastResult": max((m["date"] for m in played), default=None), "lastMatchday": last_md,
                 "nextMatchday": max(set(u["md"] for u in upcoming), key=[u["md"] for u in upcoming].count) if upcoming else last_md + 1,
                 "fetchedAt": fetched_at,
                 "generatedAt": datetime.now(timezone.utc).isoformat(timespec="minutes"),
                 "checks": checks, "health": health},
        "model": {"mu": r(params["mu"]), "home": r(params["home"]), "levers": lever_cfg, "live": live_cfg},
        "eval": evaluation,
        "teams": teams,
        "played": played,
        "upcoming": upcoming,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} : {len(played)} matchs joués, "
          f"{len(upcoming)} à venir (J{last_md + 1}), mode {mode}")


if __name__ == "__main__":
    main()
