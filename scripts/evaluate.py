"""
Mesurer au lieu de supposer. Trois contrôles, tous « hors échantillon » :

1. Le bilan des pronostics (priorité 1)
   La même recette que l'app (forces d'attaque et de défense, saison précédente à poids réduit,
   tirs cadrés) est rejouée journée par journée sur les saisons 2024-25 et 2025-26, puis comparée,
   SUR EXACTEMENT LES MÊMES MATCHS, aux cotes des bookmakers débarrassées de leur marge et à un
   modèle de référence très simple (les fréquences domicile / nul / extérieur déjà observées).
   Mesures : score de Brier, log-loss, taux de bons résultats, calibration, et un intervalle
   (bootstrap) sur l'écart avec le marché.

2. Les leviers de contexte (priorité 2)
   Pour chaque levier (meilleur buteur absent, match de coupe en semaine, pluie ou vent), on
   estime son effet réel sur les buts à partir des matchs passés, puis on vérifie, match après
   match et dans l'ordre chronologique, qu'appliquer cet effet améliore la log-loss des matchs
   suivants. Un levier qui n'améliore rien est écarté de l'app.

3. Le modèle en direct (priorité 3)
   Les buts arrivent minute après minute avec une intensité qui dépend des forces d'avant-match,
   du moment du match, du score (l'équipe menée attaque plus), des cartons rouges et des tirs
   cadrés déjà obtenus. Les paramètres sont estimés sur les saisons passées et validés sur la
   saison suivante, à 15, 30, 45, 60, 75 et 85 minutes, contre l'ancien modèle à effets fixes.
"""

import hashlib
import json
import math
import random
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_history import TEAMS as ESPN_TEAMS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
HIST = RAW / "history"
SOT_TO_GOALS = 0.31
CODE_TO_ESPN = {v[0]: k for k, v in ESPN_TEAMS.items() if v[0]}

# Les hypothèses d'origine de l'app, testées telles quelles.
HYPOTHESES = {
    "buteur": {"own": 0.86, "other": 1.0},
    "coupe": {"own": 0.95, "other": 1.03},
    "meteo": {"own": 0.90, "other": 0.90},
}
RAIN_MM, GUST_KMH = 1.5, 55


def r(x, d=3):
    return None if x is None else round(float(x), d)


def load(name, default=None):
    p = HIST / name
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return default


def season_of(dt):
    y = dt.year if dt.month >= 7 else dt.year - 1
    return f"{y % 100:02d}{(y + 1) % 100:02d}"


# ------------------------------------------------------------------ métriques

def outcome(hg, ag):
    return 0 if hg > ag else 1 if hg == ag else 2


def brier(p, o):
    return sum((p[i] - (1 if i == o else 0)) ** 2 for i in range(3))


def logloss(p, o):
    return -math.log(max(p[o], 1e-6))


def devig(odds):
    """Cotes -> probabilités, marge retirée (normalisation proportionnelle)."""
    if not odds or any(not x or x <= 1 for x in odds):
        return None
    inv = [1 / x for x in odds]
    s = sum(inv)
    return [x / s for x in inv]


def bootstrap_diff(a, b, n=2000, seed=7):
    """Intervalle à 90 % de la moyenne de (a - b), par rééchantillonnage des matchs."""
    rng = random.Random(seed)
    d = [x - y for x, y in zip(a, b)]
    k = len(d)
    if k < 10:
        return None
    means = sorted(sum(d[rng.randrange(k)] for _ in range(k)) / k for _ in range(n))
    return [means[int(0.05 * n)], means[int(0.95 * n)]]


# ------------------------------------------------------------------ 1. backtest des saisons passées

def backtest_season(rows, prev_rows, fit, expected_goals, markets, prev_weight):
    """Rejoue la recette de l'app sur une saison : chaque journée prédite avec le passé seul."""
    history = [{**m, "md": m["md"] - 38, "w0": prev_weight, "xgH": None, "xgA": None} for m in prev_rows]
    season = [{**m, "xgH": m["sotH"] * SOT_TO_GOALS if m.get("sotH") is not None else None,
               "xgA": m["sotA"] * SOT_TO_GOALS if m.get("sotA") is not None else None} for m in rows]
    out = []
    last = max(m["md"] for m in season)
    teams = sorted({t for m in season for t in (m["home"], m["away"])})
    for md in range(1, last + 1):
        params = fit(history + [m for m in season if m["md"] < md], teams, md)
        for m in season:
            if m["md"] != md:
                continue
            lh, la = expected_goals(params, m["home"], m["away"])
            p, over, _ = markets(lh, la)
            out.append({"date": m["date"], "md": md, "home": m["home"], "away": m["away"],
                        "hg": m["hg"], "ag": m["ag"], "lh": r(lh, 4), "la": r(la, 4),
                        "p": [r(x, 4) for x in p], "over25": r(over, 4), "odds": m.get("odds")})
    return out


def backtests(read_results, fit, expected_goals, markets, prev_weight, model_key, skip=None):
    """Saisons passées disponibles (avec la saison d'avant), mises en cache tant que rien ne change."""
    files = sorted(RAW.glob("F1_*.csv"))
    cache = load("backtest.json", {}) or {}
    out = {}
    for i, f in enumerate(files):
        code = f.stem.split("_")[1]
        if code == skip:
            continue
        prev = files[i - 1] if i > 0 and int(files[i - 1].stem[3:5]) == int(code[:2]) - 1 else None
        key = hashlib.sha1((model_key + f.read_bytes().decode("utf-8", "ignore") +
                            (prev.read_bytes().decode("utf-8", "ignore") if prev else "")).encode()).hexdigest()
        if cache.get(code, {}).get("key") == key:
            out[code] = cache[code]
            continue
        rows = read_results(f, known_only=False)
        if not rows:
            continue
        prev_rows = read_results(prev, known_only=False) if prev else []
        preds = backtest_season(rows, prev_rows, fit, expected_goals, markets, prev_weight)
        out[code] = {"key": key, "hasPrev": bool(prev), "matches": preds}
        print(f"  backtest {code} : {len(preds)} matchs")
    HIST.mkdir(parents=True, exist_ok=True)
    (HIST / "backtest.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def score_models(rows):
    """rows : {o, ia, mk, ref}. Toutes les mesures sur les mêmes matchs."""
    n = len(rows)
    if not n:
        return None
    res = {"n": n, "models": {}}
    for k in ("ia", "mk", "ref"):
        b = [brier(x[k], x["o"]) for x in rows]
        ll = [logloss(x[k], x["o"]) for x in rows]
        acc = sum(1 for x in rows if x[k].index(max(x[k])) == x["o"]) / n
        res["models"][k] = {"brier": r(sum(b) / n, 4), "logloss": r(sum(ll) / n, 4), "acc": r(acc, 3)}
        res["models"][k]["_b"], res["models"][k]["_ll"] = b, ll
    for metric, key in (("brier", "_b"), ("logloss", "_ll")):
        ci = bootstrap_diff(res["models"]["ia"][key], res["models"]["mk"][key])
        res[f"diffMk_{metric}"] = [r(ci[0], 4), r(ci[1], 4)] if ci else None
        ci = bootstrap_diff(res["models"]["ia"][key], res["models"]["ref"][key])
        res[f"diffRef_{metric}"] = [r(ci[0], 4), r(ci[1], 4)] if ci else None
    for k in res["models"]:
        res["models"][k].pop("_b")
        res["models"][k].pop("_ll")
    res["calib"] = {k: calibration(rows, k) for k in ("ia", "mk")}
    return res


def calibration(rows, k, edges=(0, .1, .2, .3, .4, .5, .6, .7, 1.0)):
    pts = [(x[k][i], 1 if i == x["o"] else 0) for x in rows for i in range(3)]
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        b = [p for p in pts if lo <= p[0] < hi]
        if len(b) >= 8:
            out.append({"lo": lo, "hi": hi, "n": len(b), "pred": r(sum(p for p, _ in b) / len(b)),
                        "obs": r(sum(h for _, h in b) / len(b))})
    return out


def quality(bt, current_played, current_code):
    """Bilan de l'IA, du marché et de la référence sur les mêmes matchs."""
    def ref_probs(prior):
        n = len(prior)
        if n < 30:
            return [0.44, 0.27, 0.29]
        c = [0, 0, 0]
        for o in prior:
            c[o] += 1
        return [x / n for x in c]

    # Résultats de toutes les saisons dans l'ordre : la référence n'utilise que le passé.
    seasons = {code: s["matches"] for code, s in bt.items() if code != current_code}
    seasons[current_code] = [{"date": m["date"], "hg": m["hg"], "ag": m["ag"], "p": m["pred"]["p"],
                              "odds": m.get("odds"), "home": m["home"], "away": m["away"]}
                             for m in current_played]
    chrono = sorted(((c, m) for c, ms in seasons.items() for m in ms), key=lambda x: x[1]["date"])
    seen, rows = [], {}
    by_date = {}
    for c, m in chrono:
        by_date.setdefault(m["date"], []).append((c, m))
    for d in sorted(by_date):
        ref = ref_probs(seen)
        for c, m in by_date[d]:
            mk = devig(m.get("odds"))
            o = outcome(m["hg"], m["ag"])
            if mk and (c == current_code or bt.get(c, {}).get("hasPrev")):
                rows.setdefault(c, []).append({"o": o, "ia": m["p"], "mk": mk, "ref": ref})
        seen.extend(outcome(m["hg"], m["ag"]) for _, m in by_date[d])

    out = {"seasons": {}}
    for c in sorted(rows):
        out["seasons"][c] = score_models(rows[c])
    pooled = [x for c in sorted(rows) for x in rows[c]]
    out["all"] = score_models(pooled)
    out["current"] = current_code
    out["notInCommon"] = len(current_played) - len(rows.get(current_code, []))
    return out


# ------------------------------------------------------------------ données ESPN reliées aux pronostics

def espn_index():
    l1 = load("espn_l1.json", {}) or {}
    for eid, e in l1.items():
        e["id"] = eid
        e["dt"] = datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
        e["season"] = season_of(e["dt"])
    return l1


def link_backtest(bt, l1):
    """Relie chaque match football-data à son match ESPN (même date à un jour près, même score)."""
    from collections import Counter
    votes = {}
    by_day = {}
    for e in l1.values():
        by_day.setdefault(e["dt"].date().isoformat(), []).append(e)
    rows = [(code, m) for code, s in bt.items() for m in s["matches"]]
    for _, m in rows:
        d = datetime.fromisoformat(m["date"]).date()
        cands = [e for k in (d - timedelta(days=1), d, d + timedelta(days=1)) for e in by_day.get(k.isoformat(), [])
                 if e["hg"] == m["hg"] and e["ag"] == m["ag"]]
        for e in cands:
            votes.setdefault(m["home"], Counter())[e["home"]] += 1
            votes.setdefault(m["away"], Counter())[e["away"]] += 1
    name_to_id = {n: c.most_common(1)[0][0] for n, c in votes.items() if c.most_common(1)[0][1] >= 5}
    pair = {(e["season"], e["home"], e["away"]): e for e in l1.values()}
    linked = []
    for code, m in rows:
        hid, aid = name_to_id.get(m["home"]), name_to_id.get(m["away"])
        e = pair.get((code, hid, aid))
        if e and (e["hg"], e["ag"]) == (m["hg"], m["ag"]):
            linked.append((code, m, e))
    return linked


def link_current(played, l1, code):
    pair = {(e["season"], e["home"], e["away"]): e for e in l1.values()}
    out = []
    for m in played:
        e = pair.get((code, CODE_TO_ESPN.get(m["home"]), CODE_TO_ESPN.get(m["away"])))
        if e and (e["hg"], e["ag"]) == (m["hg"], m["ag"]):
            out.append((code, {"date": m["date"], "hg": m["hg"], "ag": m["ag"],
                               "lh": m["pred"]["lh"], "la": m["pred"]["la"], "p": m["pred"]["p"]}, e))
    return out


# ------------------------------------------------------------------ 2. les leviers

def lever_features(linked, l1):
    summaries = load("espn_summaries.json", {}) or {}
    cups = load("espn_cups.json", {}) or {}
    obs = load("weather_obs.json", {}) or {}
    cup_by_team = {}
    for c in cups.values():
        dt = datetime.fromisoformat(c["date"].replace("Z", "+00:00"))
        for t in (c["home"], c["away"]):
            cup_by_team.setdefault(t, []).append(dt)
    # Buts de chaque joueur en Ligue 1, par équipe et par saison, avec la date.
    goals_by = {}
    for e in l1.values():
        for side, base, extra, kind, who in e["goals"]:
            if kind == "og" or not who:
                continue
            tid = e["home"] if side == "h" else e["away"]
            goals_by.setdefault((e["season"], tid), []).append((e["dt"], who))

    def top_scorer(season, tid, before):
        cnt = {}
        for dt, who in goals_by.get((season, tid), []):
            if dt < before:
                cnt[who] = cnt.get(who, 0) + 1
        if not cnt:
            return None
        who, n = max(cnt.items(), key=lambda x: x[1])
        return who if n >= 3 else None

    feats = []
    for code, m, e in linked:
        f = {"code": code, "date": e["dt"], "lh": m["lh"], "la": m["la"], "hg": m["hg"], "ag": m["ag"]}
        s = summaries.get(e["id"])
        for side, tid in (("H", e["home"]), ("A", e["away"])):
            ts = top_scorer(e["season"], tid, e["dt"])
            starters = (s or {}).get("starters", {}).get(tid)
            f[f"but{side}"] = None if not ts or not starters else (ts not in starters)
            f[f"eur{side}"] = any(timedelta(hours=12) <= e["dt"] - d <= timedelta(days=4.5)
                                  for d in cup_by_team.get(tid, []))
        w = obs.get(e["id"])
        f["meteo"] = None if not w else (not w["roof"] and (w["rain"] >= RAIN_MM or w["gust"] >= GUST_KMH))
        feats.append(f)
    feats.sort(key=lambda f: f["date"])
    return feats


def adjusted(f, lever, own, other):
    """Buts attendus après application du levier (multiplicateurs own / other)."""
    lh, la = f["lh"], f["la"]
    if lever == "meteo":
        if f["meteo"]:
            lh, la = lh * own, la * own
        return lh, la
    key = "but" if lever == "buteur" else "eur"
    if f.get(key + "H"):
        lh, la = lh * own, la * other
    if f.get(key + "A"):
        la, lh = la * own, lh * other
    return lh, la


def applies(f, lever):
    if lever == "meteo":
        return f["meteo"] is not None, bool(f["meteo"])
    key = "but" if lever == "buteur" else "eur"
    known = f.get(key + "H") is not None and f.get(key + "A") is not None
    return known, bool(f.get(key + "H") or f.get(key + "A"))


def fit_lever(rows, lever, prior_sd=0.15):
    """Estime log(own), log(other) par maximum de vraisemblance (loi de Poisson), avec un a priori « aucun effet »."""
    on = [f for f in rows if applies(f, lever)[1]]
    if not on:
        return 1.0, 1.0, None
    both = lever == "meteo"

    def nll(x):
        a = x[0]
        b = a if both else (x[1] if lever == "coupe" else 0.0)
        s = 0.0
        for f in on:
            lh, la = adjusted(f, lever, math.exp(a), math.exp(b))
            s -= f["hg"] * math.log(lh) - lh + f["ag"] * math.log(la) - la
        return s + (a ** 2 + (b ** 2 if lever == "coupe" else 0)) / (2 * prior_sd ** 2)

    x0 = [0.0, 0.0] if lever == "coupe" else [0.0]
    res = minimize(nll, x0, method="BFGS")
    a = res.x[0]
    b = a if both else (res.x[1] if lever == "coupe" else 0.0)
    try:
        sd = math.sqrt(res.hess_inv[0][0])
    except Exception:  # noqa: BLE001
        sd = None
    return math.exp(a), math.exp(b), sd


def eval_levers(feats, markets):
    """Effet mesuré et test chronologique hors échantillon pour chaque levier."""
    out = {}
    for lever in ("buteur", "coupe", "meteo"):
        known = [f for f in feats if applies(f, lever)[0]]
        on = [f for f in known if applies(f, lever)[1]]
        own, other, sd = fit_lever(known, lever)
        # Test hors échantillon : l'effet est réestimé avec les matchs ANTÉRIEURS seulement.
        ll_base, ll_meas, ll_hyp = [], [], []
        hyp = HYPOTHESES[lever]
        past = []
        for f in known:
            if applies(f, lever)[1]:
                o = outcome(f["hg"], f["ag"])
                if len([x for x in past if applies(x, lever)[1]]) >= 15:
                    a, b, _ = fit_lever(past, lever)
                    p0, _, _ = markets(f["lh"], f["la"])
                    p1, _, _ = markets(*adjusted(f, lever, a, b))
                    p2, _, _ = markets(*adjusted(f, lever, hyp["own"], hyp["other"]))
                    ll_base.append(logloss(p0, o))
                    ll_meas.append(logloss(p1, o))
                    ll_hyp.append(logloss(p2, o))
            past.append(f)
        n_test = len(ll_base)
        gain = (sum(ll_base) - sum(ll_meas)) / n_test if n_test else None
        gain_hyp = (sum(ll_base) - sum(ll_hyp)) / n_test if n_test else None
        ci = bootstrap_diff(ll_base, ll_meas) if n_test >= 10 else None
        kept = bool(n_test >= 30 and gain is not None and gain > 0)
        exp_on = sum(adjusted(f, lever, 1, 1)[0] + adjusted(f, lever, 1, 1)[1] for f in on)
        obs_on = sum(f["hg"] + f["ag"] for f in on)
        out[lever] = {
            "n": len(on), "nKnown": len(known), "nTest": n_test,
            "own": r(own, 3), "other": r(other, 3), "sd": r(sd, 3),
            "ci": [r(math.exp(math.log(own) - 1.645 * sd), 3), r(math.exp(math.log(own) + 1.645 * sd), 3)] if sd else None,
            "hypothesis": hyp, "gain": r(gain, 4), "gainHyp": r(gain_hyp, 4),
            "gainCi": [r(ci[0], 4), r(ci[1], 4)] if ci else None,
            "goalsObserved": obs_on, "goalsExpected": r(exp_on, 1),
            "kept": kept,
        }
    return out


# ------------------------------------------------------------------ 3. le direct

BINS = 90
DUR = np.ones(BINS + 1)
DUR[0] = 0
DUR[45] = 3.0   # minute 45 + temps additionnel de la 1re période
DUR[90] = 6.0   # minute 90 + temps additionnel de la 2e période
U = np.arange(BINS + 1)
OLD = {"alpha": 0.0, "gamma": 0.0, "trail": 0.0, "lead": 0.0,
       "redOwn": math.log(0.72), "redOpp": math.log(1.25), "sot": 0.0}
NAMES = ["alpha", "gamma", "trail", "lead", "redOwn", "redOpp", "sot"]   # alpha reste à 0
PRIOR = {"alpha": (0, .1), "gamma": (0, .5), "trail": (0, .3), "lead": (0, .3),
         "redOwn": (0, .5), "redOpp": (0, .5), "sot": (0, .3)}


def to_bin(base, extra):
    if base <= 45:
        return max(1, min(base, 45))
    return min(base, 90)


def shape(gamma):
    w = DUR * (1 + gamma * (U - 45.5) / 45)
    w[0] = 0
    w = np.clip(w, 1e-6, None)
    return w / w.sum()


def live_dataset(linked):
    """Pour chaque match : buts, cartons rouges et tirs cadrés par minute."""
    summaries = load("espn_summaries.json", {}) or {}
    data = []
    for code, m, e in linked:
        g = np.zeros((2, BINS + 1))
        red = np.zeros((2, BINS + 1))
        sot = np.zeros((2, BINS + 1))
        for side, base, extra, *_ in e["goals"]:
            g[0 if side == "h" else 1, to_bin(base, extra)] += 1
        for side, base, extra, *_ in e["reds"]:
            red[0 if side == "h" else 1, to_bin(base, extra)] += 1
        s = summaries.get(e["id"])
        has_shots = bool(s and s.get("shots"))
        if has_shots:
            for team, base, extra, kind in s["shots"]:
                if kind in ("on", "goal") and team in (e["homeName"], e["awayName"]):
                    sot[0 if team == e["homeName"] else 1, to_bin(base, extra)] += 1
        data.append({"code": code, "lam": np.array([m["lh"], m["la"]]), "g": g, "red": red, "sot": sot,
                     "shots": has_shots, "hg": m["hg"], "ag": m["ag"]})
    return data


def stack(data):
    """Empile les matchs en tableaux (match, équipe, minute) pour un calcul rapide."""
    G = np.stack([d["g"] for d in data])
    R = np.stack([d["red"] for d in data])
    S = np.stack([d["sot"] for d in data])
    cg = np.cumsum(G, axis=2) - G
    return {
        "G": G, "CR": np.cumsum(R, axis=2) - R, "CS": np.cumsum(S, axis=2) - S,
        "DIFF": cg[:, 0] - cg[:, 1], "LAM": np.stack([d["lam"] for d in data]),
        "SH": np.array([d["shots"] for d in data], dtype=float),
    }


def nll_live(theta, A):
    th = dict(zip(NAMES, theta))
    w = shape(th["gamma"])
    cum = np.cumsum(w) - w
    total = 0.0
    for i, j, sgn in ((0, 1, 1), (1, 0, -1)):
        s = sgn * A["DIFF"]
        lam = A["LAM"][:, i][:, None]
        lin = (th["alpha"] + th["trail"] * (s < 0) + th["lead"] * (s > 0)
               + th["redOwn"] * A["CR"][:, i] + th["redOpp"] * A["CR"][:, j])
        mom = np.log((A["CS"][:, i] + 1) / (lam / SOT_TO_GOALS * cum[None, :] + 1))
        lin = lin + th["sot"] * mom * A["SH"][:, None]
        rate = lam * w[None, :] * np.exp(lin)
        total -= float(np.sum(A["G"][:, i] * np.log(rate + 1e-12) - rate))
    pen = sum((th[k] - PRIOR[k][0]) ** 2 / (2 * PRIOR[k][1] ** 2) for k in NAMES)
    return total + pen


def fit_live(data, free=None):
    """Estime les paramètres libres ; les autres restent à leur valeur de l'ancien modèle."""
    A = stack(data)
    free = list(free if free is not None else NAMES[1:])
    x0 = np.array([OLD[k] for k in NAMES])
    idx = [NAMES.index(k) for k in free]
    if not idx:
        return dict(OLD)

    def f(z):
        x = x0.copy()
        x[idx] = z
        return nll_live(x, A)
    res = minimize(f, x0[idx], method="L-BFGS-B")
    x = x0.copy()
    x[idx] = res.x
    return dict(zip(NAMES, [float(v) for v in x]))


def dp_probs(lh, la, nxt, hg, ag, rh, ra, sh, sa, th, maxg=9):
    """Probabilités finales (1N2, +2,5) depuis la minute nxt, en simulant les minutes restantes."""
    w = shape(th["gamma"])
    cum = np.cumsum(w) - w
    P = np.zeros((maxg + 1, maxg + 1))
    P[0, 0] = 1.0
    I, J = np.meshgrid(np.arange(maxg + 1), np.arange(maxg + 1), indexing="ij")
    base_h = th["alpha"] + th["redOwn"] * rh + th["redOpp"] * ra
    base_a = th["alpha"] + th["redOwn"] * ra + th["redOpp"] * rh
    for u in range(max(nxt, 1), BINS + 1):
        if w[u] <= 0:
            continue
        diff = (hg + I) - (ag + J)
        mh, ma = base_h, base_a
        if th["sot"]:
            mh = mh + th["sot"] * math.log((sh + 1) / (lh / SOT_TO_GOALS * cum[nxt] + 1))
            ma = ma + th["sot"] * math.log((sa + 1) / (la / SOT_TO_GOALS * cum[nxt] + 1))
        rh_ = lh * w[u] * np.exp(mh + th["trail"] * (diff < 0) + th["lead"] * (diff > 0))
        ra_ = la * w[u] * np.exp(ma + th["trail"] * (diff > 0) + th["lead"] * (diff < 0))
        ph, pa = 1 - np.exp(-rh_), 1 - np.exp(-ra_)
        new = P * (1 - ph) * (1 - pa)
        new[1:, :] += (P * ph * (1 - pa))[:-1, :]
        new[:, 1:] += (P * (1 - ph) * pa)[:, :-1]
        new[1:, 1:] += (P * ph * pa)[:-1, :-1]
        P = new
    fh, fa = hg + I, ag + J
    p = [float(P[fh > fa].sum()), float(P[fh == fa].sum()), float(P[fh < fa].sum())]
    s = sum(p)
    return [x / s for x in p], float(P[fh + fa > 2].sum() / s)


CHECKPOINTS = [15, 30, 45, 60, 75, 85]
# Les briques du modèle en direct, ajoutées une à une seulement si elles améliorent les pronostics.
BLOCKS = {
    "cartons": ["redOwn", "redOpp"],
    "rythme": ["gamma"],
    "score": ["trail", "lead"],
    "tirs": ["sot"],
}


def state_at(d, c):
    """État du match après la minute c (inclus)."""
    g = d["g"][:, :c + 1].sum(axis=1)
    rr = d["red"][:, :c + 1].sum(axis=1)
    s = d["sot"][:, :c + 1].sum(axis=1)
    return int(g[0]), int(g[1]), int(rr[0]), int(rr[1]), int(s[0]), int(s[1])


def oos(data, free, baseline):
    """Rejoue le direct saison par saison avec des réglages appris sur les saisons d'avant."""
    codes = sorted({d["code"] for d in data})
    out = {c: [] for c in CHECKPOINTS}
    tested = []
    for test_code in codes:
        train = [d for d in data if d["code"] < test_code]
        test = [(k, d) for k, d in enumerate(data) if d["code"] == test_code]
        if len(train) < 200 or not test:
            continue
        th = fit_live(train, free)
        tested.append(test_code)
        for k, d in test:
            o = outcome(d["hg"], d["ag"])
            for c in CHECKPOINTS:
                st = state_at(d, c)
                p, _ = dp_probs(d["lam"][0], d["lam"][1], c + 1, *st, th)
                out[c].append((logloss(p, o), brier(p, o), baseline[(k, c)]))
    return out, tested


def total_gain(res):
    return sum(np.mean([b[2][0] - b[0] for b in res[c]]) for c in CHECKPOINTS if res[c])


def eval_live(data):
    # L'ancien modèle, calculé une fois.
    baseline = {}
    for k, d in enumerate(data):
        o = outcome(d["hg"], d["ag"])
        for c in CHECKPOINTS:
            p, _ = dp_probs(d["lam"][0], d["lam"][1], c + 1, *state_at(d, c), OLD)
            baseline[(k, c)] = (logloss(p, o), brier(p, o))
    chosen, best, best_res, tested = [], 0.0, None, []
    steps = []
    remaining = list(BLOCKS)
    while remaining:
        trials = []
        for b in remaining:
            free = [x for blk in chosen + [b] for x in BLOCKS[blk]]
            res, tested = oos(data, free, baseline)
            trials.append((total_gain(res), b, res))
        trials.sort(key=lambda t: -t[0])
        for g, b, _ in trials:
            steps.append({"block": b, "with": list(chosen), "gain": r(g, 4)})
        g, b, res = trials[0]
        if g <= best:
            break
        chosen.append(b)
        remaining.remove(b)
        best, best_res = g, res
    table = []
    if best_res:
        for c in CHECKPOINTS:
            rows = best_res[c]
            ci = bootstrap_diff([x[2][0] for x in rows], [x[0] for x in rows])
            table.append({"min": c, "n": len(rows),
                          "old": {"logloss": r(np.mean([x[2][0] for x in rows]), 4), "brier": r(np.mean([x[2][1] for x in rows]), 4)},
                          "new": {"logloss": r(np.mean([x[0] for x in rows]), 4), "brier": r(np.mean([x[1] for x in rows]), 4)},
                          "gainCi": [r(ci[0], 4), r(ci[1], 4)] if ci else None})
    return chosen, steps, table, tested


def live_model(linked):
    data = live_dataset(linked)
    if len(data) < 300:
        return None
    chosen, steps, table, tested = eval_live(data)
    free = [x for blk in chosen for x in BLOCKS[blk]]
    th = fit_live(data, free)
    full = fit_live(data, NAMES[1:])
    # Décision par brique : gardée si elle a été retenue par la sélection hors échantillon.
    blocks = {b: {"kept": b in chosen,
                  "gain": next((st["gain"] for st in steps if st["block"] == b and st["with"] == []), None)}
              for b in BLOCKS}
    return {
        "params": {k: r(v, 4) for k, v in th.items()},
        "fitted": {k: r(v, 4) for k, v in full.items()},
        "used": "mesuré" if chosen else "ancien",
        "blocks": blocks, "chosen": chosen, "steps": steps,
        "n": len(data), "nShots": sum(1 for d in data if d["shots"]), "nReds": int(sum(d["red"].sum() for d in data)),
        "tested": tested, "table": table,
        "dur": [float(x) for x in DUR],
    }
# ------------------------------------------------------------------ point d'entrée

def run(current_played, current_code, model):
    """model : fonctions et constantes de build_data. Renvoie le bloc « eval » de season.json."""
    bt = backtests(model["read_results"], model["fit"], model["expected_goals"], model["markets"],
                   model["prev_weight"], model["key"], skip=current_code)
    # La saison en cours vient des pronostics de l'app ; son fichier football-data n'est pas rejoué.
    bt = {c: s for c, s in bt.items() if c != current_code}
    q = quality(bt, current_played, current_code)
    l1 = espn_index()
    linked = link_backtest({c: s for c, s in bt.items()}, l1) if l1 else []
    linked += link_current(current_played, l1, current_code) if l1 else []
    out = {"quality": q, "linked": len(linked), "generatedAt": datetime.now(timezone.utc).isoformat(timespec="minutes")}
    if linked:
        feats = lever_features(linked, l1)
        out["levers"] = eval_levers(feats, model["markets"])
        out["live"] = live_model(linked)
    return out
