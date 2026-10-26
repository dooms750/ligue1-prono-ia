"""
Génère public/data/season.json : forces des équipes, pronostics de l'IA,
résultats et contexte de la prochaine journée de Ligue 1.

Deux modes :
  python scripts/build_data.py --demo
      Saison simulée (données fictives) pour tester l'app sans source de données.

  python scripts/build_data.py --csv F1.csv --fixtures prochaine_journee.csv
      Vrais résultats au format football-data.co.uk (colonnes Date, HomeTeam,
      AwayTeam, FTHG, FTAG, et si présentes HTHG, HTAG, HR, AR, AvgH, AvgD, AvgA).
      Le fichier --fixtures liste les matchs à venir : Date,HomeTeam,AwayTeam.

Le modèle : chaque équipe a une force d'attaque et une faiblesse défensive.
Buts attendus de l'équipe à domicile = exp(mu + avantage_domicile + attaque_dom + defense_ext).
Le nombre de buts suit une loi de Poisson. Les paramètres sont estimés par
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


# ---------------------------------------------------------------- modèle

def fit(matches, teams, current_md):
    """Estime mu, avantage domicile, attaque et défense par équipe."""
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    if not matches:
        return {"mu": math.log(1.3), "home": 0.22,
                "att": {t: 0.0 for t in teams}, "def": {t: 0.0 for t in teams}}

    h = np.array([idx[m["home"]] for m in matches])
    a = np.array([idx[m["away"]] for m in matches])
    hg = np.array([m["hg"] for m in matches], dtype=float)
    ag = np.array([m["ag"] for m in matches], dtype=float)
    w = np.array([math.exp(-DECAY * (current_md - m["md"])) for m in matches])

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

def build_real(csv_path, fixtures_path):
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    rows.sort(key=lambda r_: datetime.strptime(r_["Date"], "%d/%m/%Y"))
    played = []
    for i, row in enumerate(rows):
        home, away = CSV_NAMES.get(row["HomeTeam"]), CSV_NAMES.get(row["AwayTeam"])
        if not home or not away or not row.get("FTHG"):
            continue
        odds = None
        if row.get("AvgH"):
            odds = [float(row["AvgH"]), float(row["AvgD"]), float(row["AvgA"])]
        played.append({
            # Approximation : 9 matchs = une journée, dans l'ordre des dates.
            "md": i // 9 + 1,
            "date": datetime.strptime(row["Date"], "%d/%m/%Y").strftime("%Y-%m-%d"),
            "home": home, "away": away,
            "hg": int(row["FTHG"]), "ag": int(row["FTAG"]),
            "htH": int(row["HTHG"]) if row.get("HTHG") else None,
            "htA": int(row["HTAG"]) if row.get("HTAG") else None,
            "redH": 1 if row.get("HR") and int(row["HR"]) > 0 else None,
            "redA": 1 if row.get("AR") and int(row["AR"]) > 0 else None,
            "goals": None, "odds": odds,
        })
    next_md = (played[-1]["md"] + 1) if played else 1
    upcoming = []
    for row in csv.DictReader(open(fixtures_path, encoding="utf-8-sig")):
        upcoming.append({
            "md": next_md, "date": row["Date"],
            "home": CSV_NAMES.get(row["HomeTeam"], row["HomeTeam"]),
            "away": CSV_NAMES.get(row["AwayTeam"], row["AwayTeam"]),
            "odds": None,
            "ctx": {"absH": [], "absA": [], "europeH": False, "europeA": False, "weather": "beau"},
        })
    return played, upcoming, "reel"


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
    ap.add_argument("--csv")
    ap.add_argument("--fixtures")
    args = ap.parse_args()

    if args.csv:
        played, upcoming, mode = build_real(args.csv, args.fixtures)
    else:
        played, upcoming, mode = build_demo()

    codes = list(TEAMS)
    last_md = max((m["md"] for m in played), default=0)

    # Pronostics « walk-forward » : chaque journée prédite avec le passé seulement.
    for md in range(1, last_md + 1):
        params = fit([m for m in played if m["md"] < md], codes, md)
        for m in played:
            if m["md"] == md:
                lh, la = expected_goals(params, m["home"], m["away"])
                p, over, btts = markets(lh, la)
                m["pred"] = {"lh": r(lh), "la": r(la), "p": [r(x) for x in p],
                             "over25": r(over), "btts": r(btts)}

    params = fit(played, codes, last_md + 1)
    for m in upcoming:
        lh, la = expected_goals(params, m["home"], m["away"])
        m["lh"], m["la"] = r(lh), r(la)

    tab = standings(played, codes)
    teams = {}
    for c in codes:
        name, color = TEAMS[c]
        teams[c] = {"name": name, "short": c, "color": color,
                    "att": r(params["att"][c]), "def": r(params["def"][c]), **tab[c]}

    data = {
        "meta": {"mode": mode, "season": "2026-27", "lastMatchday": last_md,
                 "nextMatchday": last_md + 1,
                 "generatedAt": datetime.now(timezone.utc).isoformat(timespec="minutes")},
        "model": {"mu": r(params["mu"]), "home": r(params["home"])},
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
