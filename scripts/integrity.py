"""
Fiabilité des données (priorité 4).

- cross_check : compare les scores de OneFootball, ESPN et football-data.co.uk, vérifie que
  chaque équipe est reconnue et que les journées sont cohérentes. Si deux sources s'accordent
  contre OneFootball, leur score est retenu et la correction est signalée.
- snapshots : garde une trace de chaque pronostic publié (probabilités, leviers allumés,
  données utilisées, heure de calcul) dans data/raw/snapshots_<saison>.json. La trace est mise
  à jour jusqu'au coup d'envoi, puis figée : c'est le pronostic qui a réellement été affiché.
- health : résume le journal de santé de la collecte pour l'app.
"""

import csv
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# Âge maximal raisonnable de chaque source (heures) avant de la signaler comme en retard.
MAX_AGE = {"onefootball": 14, "espn": 14, "weather": 14, "footballdata": 14, "history": 48}
LABELS = {"onefootball": "OneFootball (matchs, compos, presse)", "onefootball_quick": "OneFootball, collecte rapide en match",
          "espn": "ESPN (scores à la pause)", "weather": "Prévisions météo (Open-Meteo)",
          "footballdata": "football-data.co.uk (cotes)", "history": "Historique (ESPN, archives météo)"}


def cross_check(played, code, csv_names, of_unknown=()):
    issues, fixed = [], []
    espn = {}
    f = RAW / f"espn_{code}.json"
    if f.exists():
        for k, v in json.loads(f.read_text(encoding="utf-8")).get("matches", {}).items():
            espn[tuple(k.split("-"))] = (v["hg"], v["ag"])
    fd, fd_unknown = {}, set()
    f = RAW / f"F1_{code}.csv"
    if f.exists():
        for row in csv.DictReader(open(f, encoding="utf-8-sig")):
            h, a = csv_names.get(row.get("HomeTeam")), csv_names.get(row.get("AwayTeam"))
            if not h or not a:
                fd_unknown.update(x for x in (row.get("HomeTeam"), row.get("AwayTeam")) if x and x not in csv_names)
                continue
            try:
                fd[(h, a)] = (int(row["FTHG"]), int(row["FTAG"]))
            except (KeyError, ValueError):
                pass

    compared = agree = 0
    seen = set()
    for m in played:
        key = (m["home"], m["away"])
        if key in seen:
            issues.append(f"Match en double : {m['home']}-{m['away']}")
        seen.add(key)
        ours = (m["hg"], m["ag"])
        others = {s: v for s, v in (("ESPN", espn.get(key)), ("football-data", fd.get(key))) if v}
        if not others:
            continue
        compared += 1
        if all(v == ours for v in others.values()):
            agree += 1
            continue
        vals = list(others.values())
        txt = ", ".join(f"{s} {v[0]}-{v[1]}" for s, v in others.items())
        if len(vals) == 2 and vals[0] == vals[1]:
            m["hg"], m["ag"] = vals[0]
            m["scoreFixed"] = {"onefootball": list(ours), "by": list(others)}
            fixed.append(f"{m['home']}-{m['away']} : OneFootball {ours[0]}-{ours[1]} corrigé en {vals[0][0]}-{vals[0][1]} ({txt})")
        else:
            issues.append(f"{m['home']}-{m['away']} : OneFootball {ours[0]}-{ours[1]}, {txt}")

    known = {(m["home"], m["away"]) for m in played}
    for key in set(espn) | set(fd):
        if key not in known:
            issues.append(f"{key[0]}-{key[1]} terminé selon {'ESPN' if key in espn else 'football-data'}, absent de OneFootball")
    per_md = {}
    for m in played:
        per_md[m["md"]] = per_md.get(m["md"], 0) + 1
    for md, n in per_md.items():
        if n > 9:
            issues.append(f"Journée {md} : {n} matchs au lieu de 9 au plus")
    for name in sorted(set(of_unknown)):
        issues.append(f"Équipe inconnue chez OneFootball : {name}")
    for name in sorted(fd_unknown):
        issues.append(f"Équipe inconnue chez football-data : {name}")
    return {"compared": compared, "agree": agree, "issues": issues[:30], "fixed": fixed}


def health():
    f = RAW / "health.json"
    try:
        h = json.loads(f.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return []
    now = datetime.now(timezone.utc)
    out = []
    for k, label in LABELS.items():
        e = h.get(k)
        if not e:
            continue
        last_ok = e.get("lastOk")
        age = (now - datetime.fromisoformat(last_ok)).total_seconds() / 3600 if last_ok else None
        late = age is None or (k in MAX_AGE and age > MAX_AGE[k])
        status = "ko" if not e.get("ok") else "late" if late else "partial" if e.get("partial") else "ok"
        out.append({"id": k, "label": label, "status": status, "lastOk": last_ok,
                    "lastAttempt": e.get("lastAttempt"), "error": e.get("error"),
                    "failures": e.get("failures", 0), "count": e.get("count")})
    return out


def snapshots(upcoming, played, code, now_paris, model_info, fetched_at):
    """Trace de chaque pronostic publié ; figée au coup d'envoi."""
    path = RAW / f"snapshots_{code}.json"
    try:
        snap = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        snap = {}
    stamp = datetime.now(timezone.utc).isoformat(timespec="minutes")
    for m in upcoming:
        key = f"{m['home']}-{m['away']}"
        kick = datetime.fromisoformat(f"{m['date']}T{m.get('time') or '21:00'}")
        if now_paris.replace(tzinfo=None) >= kick:
            # Coup d'envoi passé : la trace est figée, l'app affiche le pronostic publié.
            e = snap.get(key)
            if e:
                m["published"] = {"lh": e["lh"], "la": e["la"], "p": e["p"], "levers": e["levers"], "at": e["at"],
                                  "firstAt": e["firstAt"], "dataAt": e.get("dataAt"), "changes": len(e.get("changes", [])),
                                  "model": e.get("model"), "frozen": True}
            continue
        pub = m["published"]
        ctx = m.get("ctx") or {}
        w = ctx.get("meteo")
        pr = ctx.get("press") or {}
        entry = snap.get(key, {"firstAt": stamp, "changes": []})
        last = entry.get("p")
        if last is None or max(abs(a - b) for a, b in zip(last, pub["p"])) >= 0.01:
            entry["changes"] = (entry.get("changes", []) + [{"at": stamp, "p": pub["p"]}])[-12:]
        entry.update({
            "date": m["date"], "time": m.get("time"), "md": m["md"],
            "at": stamp, "dataAt": fetched_at, "model": model_info,
            "lh": pub["lh"], "la": pub["la"], "p": pub["p"], "levers": pub["levers"],
            "odds": m.get("odds"),
            "inputs": {
                "meteo": {k: w.get(k) for k in ("pRain", "pWind", "confidence", "updated", "daysBefore")} if w else None,
                "presse": {s: (pr.get(s) or {}).get("scorerOut") for s in ("H", "A")},
                "coupe": {s: ctx.get(f"cup{s}") for s in ("H", "A")},
            },
        })
        snap[key] = entry
        m["published"] = {**pub, "at": stamp, "firstAt": entry["firstAt"], "dataAt": fetched_at,
                          "changes": len(entry["changes"]), "model": model_info}
    path.write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding="utf-8")
    for m in played:
        e = snap.get(f"{m['home']}-{m['away']}")
        if e:
            m["published"] = {"p": e["p"], "at": e["at"], "levers": e["levers"], "lh": e["lh"], "la": e["la"]}
    return snap


def model_info(params):
    return {"version": (os.environ.get("GITHUB_SHA") or "local")[:7], "mu": round(params["mu"], 3),
            "home": round(params["home"], 3)}
