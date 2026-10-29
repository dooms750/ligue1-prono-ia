"""
Historique des saisons passées pour MESURER le modèle, dans data/raw/history/ :

  espn_l1.json      chaque match de Ligue 1 depuis 2023 : score, buts et cartons rouges avec la minute,
                    tirs et tirs cadrés, titulaires, tirs minute par minute (commentaire ESPN)
  espn_cups.json    les matchs de coupe (Ligue des champions, Ligue Europa, Ligue Conférence, Coupe de France)
  weather_obs.json  la météo OBSERVÉE pendant chaque match (archives Open-Meteo / ERA5)

Ces fichiers servent à vérifier les hypothèses de l'app (effet d'une absence, d'un match de coupe,
de la pluie, d'un carton rouge) sur des centaines de matchs, au lieu de les supposer.
Une année civile déjà complète n'est jamais retéléchargée ; une fiche de match terminée non plus.
Usage : python scripts/fetch_history.py [--max-summaries 400]
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from health import record  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / "data" / "raw" / "history"
BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
UA = {"User-Agent": "Lucide (projet open source de pronostics expliqués)"}
FIRST_YEAR = 2023
CUPS = {"uefa.champions": "Ligue des champions", "uefa.europa": "Ligue Europa",
        "uefa.europa.conf": "Ligue Conférence", "fra.coupe_de_france": "Coupe de France"}

# Identifiant ESPN -> (code Lucide ou None, latitude, longitude, toit)
TEAMS = {
    "160": ("PSG", 48.8414, 2.2530, False), "166": ("LIL", 50.6119, 3.1305, True),
    "167": ("OL", 45.7653, 4.9820, False), "169": ("REN", 48.1075, -1.7128, False),
    "170": ("TRO", 48.3075, 4.0989, False), "172": ("AUX", 47.7867, 3.5886, False),
    "174": ("MON", 43.7276, 7.4156, False), "175": ("LEN", 50.4329, 2.8150, False),
    "176": ("OM", 43.2698, 5.3959, False), "179": ("TOU", 43.5833, 1.4340, False),
    "180": ("STR", 48.5602, 7.7553, False), "273": ("LOR", 47.7489, -3.3693, False),
    "2502": ("NIC", 43.7053, 7.1926, False), "2697": ("LMA", 47.9589, 0.2242, False),
    "3236": ("HAV", 49.4988, 0.1697, False), "6851": ("PFC", 48.8433, 2.2527, False),
    "6997": ("BRE", 48.4029, -4.4617, False), "7868": ("ANG", 47.4605, -0.5307, False),
    "165": (None, 47.2560, -1.5245, False),   # Nantes
    "178": (None, 45.4607, 4.3903, False),    # Saint-Étienne
    "177": (None, 49.1098, 6.1594, False),    # Metz
    "274": (None, 43.6222, 3.8120, False),    # Montpellier
    "2503": (None, 41.9310, 8.7764, False),   # Ajaccio
    "3171": (None, 45.8158, 3.1214, False),   # Clermont
    "3243": (None, 49.2468, 4.0251, False),   # Reims
}
SHOT_TYPES = {"Shot On Target": "on", "Shot Off Target": "off", "Shot Blocked": "blocked",
              "Goal": "goal", "Penalty - Scored": "goal", "Goal - Header": "goal", "Goal - Free-kick": "goal"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


def load(name, default):
    p = HIST / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def save(name, obj):
    (HIST / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def clock(display):
    """« 45'+2' » -> (45, 2) ; « 67' » -> (67, 0)."""
    m = re.match(r"(\d+)'?(?:\+(\d+))?", display or "")
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (None, 0)


def stat(comp, name):
    for s in comp.get("statistics") or []:
        if s.get("name") == name:
            try:
                return int(float(s.get("displayValue")))
            except (TypeError, ValueError):
                return None
    return None


def parse_l1(e):
    c = e["competitions"][0]
    side = {t["homeAway"]: t for t in c["competitors"]}
    hid, aid = side["home"]["team"]["id"], side["away"]["team"]["id"]
    goals, reds = [], []
    for d in c.get("details") or []:
        base, extra = clock((d.get("clock") or {}).get("displayValue"))
        if base is None:
            continue
        s = "h" if (d.get("team") or {}).get("id") == hid else "a"
        who = (d.get("athletesInvolved") or [{}])[0].get("displayName")
        if d.get("scoringPlay"):
            goals.append([s, base, extra, "og" if d.get("ownGoal") else "pen" if d.get("penaltyKick") else "", who])
        elif d.get("redCard"):
            reds.append([s, base, extra, who])
    return {
        "date": e["date"], "home": hid, "away": aid,
        "homeName": side["home"]["team"]["displayName"], "awayName": side["away"]["team"]["displayName"],
        "hg": int(side["home"]["score"]), "ag": int(side["away"]["score"]),
        "shots": [stat(side["home"], "totalShots"), stat(side["away"], "totalShots")],
        "sot": [stat(side["home"], "shotsOnTarget"), stat(side["away"], "shotsOnTarget")],
        "goals": goals, "reds": reds,
    }


def fetch_year(league, year):
    j = get(f"{BASE}{league}/scoreboard?dates={year}&limit=1000")
    return [e for e in j.get("events", []) if e["status"]["type"]["state"] == "post"]


def summary(eid):
    s = get(f"{BASE}fra.1/summary?event={eid}")
    starters = {r["team"]["id"]: [p["athlete"]["displayName"] for p in r.get("roster", []) if p.get("starter")]
                for r in s.get("rosters", [])}
    shots = []
    for c in s.get("commentary") or []:
        p = c.get("play") or {}
        kind = SHOT_TYPES.get((p.get("type") or {}).get("text"))
        if not kind:
            continue
        base, extra = clock((p.get("clock") or {}).get("displayValue") or (c.get("time") or {}).get("displayValue"))
        if base is None:
            continue
        shots.append([(p.get("team") or {}).get("displayName"), base, extra, kind])
    return {"starters": starters, "shots": shots}


def weather(l1, obs):
    """Pluie et rafales observées du coup d'envoi à deux heures après (heure UTC)."""
    todo = {}
    limit = datetime.now(timezone.utc) - timedelta(days=6)   # l'archive a quelques jours de retard
    for eid, m in l1.items():
        ko = datetime.fromisoformat(m["date"].replace("Z", "+00:00"))
        if eid in obs or ko > limit or m["home"] not in TEAMS:
            continue
        todo.setdefault(m["home"], []).append((eid, ko))
    for tid, items in todo.items():
        _, lat, lon, roof = TEAMS[tid]
        start = min(k for _, k in items).date().isoformat()
        end = max(k for _, k in items).date().isoformat()
        q = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
                                    "hourly": "precipitation,wind_gusts_10m", "timezone": "UTC"})
        try:
            j = get(f"{ARCHIVE}?{q}")
        except Exception as ex:
            print(f"  météo {tid} : {ex}", file=sys.stderr)
            continue
        times = j["hourly"]["time"]
        idx = {t: i for i, t in enumerate(times)}
        for eid, ko in items:
            hours = [(ko.replace(minute=0) + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(3)]
            ii = [idx[h] for h in hours if h in idx]
            pr = [j["hourly"]["precipitation"][i] for i in ii]
            gu = [j["hourly"]["wind_gusts_10m"][i] for i in ii]
            if not ii or any(v is None for v in pr + gu):
                continue
            obs[eid] = {"rain": round(sum(pr[:2]) + pr[2] * (ko.minute / 60), 1), "gust": max(gu), "roof": roof}
        time.sleep(0.3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-summaries", type=int, default=1200)
    args = ap.parse_args()
    HIST.mkdir(parents=True, exist_ok=True)
    meta = load("meta.json", {"years": {}})
    l1 = load("espn_l1.json", {})
    cups = load("espn_cups.json", {})
    details = load("espn_summaries.json", {})
    obs = load("weather_obs.json", {})
    this_year = date.today().year

    errors = []
    for year in range(FIRST_YEAR, this_year + 1):
        for league in ["fra.1", *CUPS]:
            key = f"{league}:{year}"
            if key in meta["years"] and year < this_year:
                continue
            try:
                events = fetch_year(league, year)
            except Exception as ex:
                errors.append(f"{key} : {ex}")
                continue
            for e in events:
                if league == "fra.1":
                    l1[e["id"]] = parse_l1(e)
                else:
                    side = {t["homeAway"]: t["team"] for t in e["competitions"][0]["competitors"]}
                    cups[e["id"]] = {"date": e["date"], "comp": CUPS[league],
                                     "home": side["home"]["id"], "away": side["away"]["id"],
                                     "homeName": side["home"]["displayName"], "awayName": side["away"]["displayName"]}
            meta["years"][key] = datetime.now(timezone.utc).isoformat(timespec="minutes")
            print(f"  {key} : {len(events)} matchs")
            time.sleep(0.3)

    todo = [eid for eid in sorted(l1, key=lambda k: l1[k]["date"]) if eid not in details][: args.max_summaries]
    print(f"Fiches de match à télécharger : {len(todo)}")
    for eid in todo:
        try:
            details[eid] = summary(eid)
        except Exception as ex:
            errors.append(f"fiche {eid} : {ex}")
        time.sleep(0.25)

    weather(l1, obs)

    save("espn_l1.json", l1)
    save("espn_cups.json", cups)
    save("espn_summaries.json", details)
    save("weather_obs.json", obs)
    save("meta.json", meta)
    print(f"Historique : {len(l1)} matchs de L1, {len(cups)} de coupe, {len(details)} fiches, {len(obs)} relevés météo")
    for e in errors[:10]:
        print("  " + e, file=sys.stderr)
    return {"count": len(l1), "errors": len(errors)}


if __name__ == "__main__":
    record("history", main)
