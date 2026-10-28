"""
Troisième source pour les matchs joués : le tableau des scores public d'ESPN, dans data/raw/espn_<saison>.json.

ESPN note le temps additionnel en clair (« 45'+2' »), ce qui donne le score exact à la pause
pour les matchs récents, avant que football-data.co.uk ne publie ses fichiers. Une journée
déjà téléchargée n'est rechargée que pendant les deux jours qui suivent.
Usage : python scripts/fetch_espn.py
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onefootball_source import kickoff  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates={}"

ESPN = {
    "Paris Saint-Germain": "PSG", "Lyon": "OL", "Marseille": "OM", "AS Monaco": "MON", "Monaco": "MON",
    "Lille": "LIL", "Lens": "LEN", "Stade Rennais": "REN", "Rennes": "REN", "Nice": "NIC",
    "Strasbourg": "STR", "Brest": "BRE", "Toulouse": "TOU", "Paris FC": "PFC", "Lorient": "LOR",
    "Angers": "ANG", "AJ Auxerre": "AUX", "Auxerre": "AUX", "Le Havre AC": "HAV", "Le Havre": "HAV",
    "Le Mans": "LMA", "Troyes": "TRO",
}


def first_half(clock):
    """« 45'+2' » -> 1re mi-temps ; « 47' » -> 2e mi-temps."""
    m = re.match(r"(\d+)'?(?:\+(\d+))?", clock or "")
    if not m:
        return None
    return int(m.group(1)) <= 45


def main():
    files = sorted(RAW.glob("onefootball_*.json"))
    if not files:
        sys.exit("Pas de cache OneFootball.")
    season = files[-1].stem.split("_")[1]
    cache_path = RAW / f"espn_{season}.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {"days": {}, "matches": {}}
    of = json.loads(files[-1].read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)

    # Les jours (heure UTC de ESPN) où des matchs de Ligue 1 ont été joués.
    days = sorted({kickoff(m).strftime("%Y%m%d") for m in of["matches"].values()
                   if m.get("kickoff") and kickoff(m) < now})
    todo = [d for d in days if d not in cache["days"]
            or now - datetime.strptime(d, "%Y%m%d").replace(tzinfo=timezone.utc) < timedelta(days=2)]
    print(f"ESPN : {len(todo)} journées à télécharger")
    for d in todo:
        try:
            req = urllib.request.Request(URL.format(d), headers={"User-Agent": "Lucide (projet open source)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode())
        except Exception as e:
            print(f"  {d} : {e}", file=sys.stderr)
            continue
        for e in data.get("events", []):
            comp = (e.get("competitions") or [{}])[0]
            teams = {t["homeAway"]: t for t in comp.get("competitors", [])}
            if "home" not in teams or "away" not in teams or e["status"]["type"]["state"] != "post":
                continue
            h, a = ESPN.get(teams["home"]["team"]["displayName"]), ESPN.get(teams["away"]["team"]["displayName"])
            if not h or not a:
                continue
            home_id = teams["home"]["team"]["id"]
            goals = [{"side": "home" if g.get("team", {}).get("id") == home_id else "away",
                      "clock": g.get("clock", {}).get("displayValue"), "ownGoal": bool(g.get("ownGoal"))}
                     for g in comp.get("details", []) if g.get("scoringPlay")]
            ht = [sum(1 for g in goals if g["side"] == s and first_half(g["clock"])) for s in ("home", "away")]
            cache["matches"][f"{h}-{a}"] = {"hg": int(teams["home"]["score"]), "ag": int(teams["away"]["score"]),
                                            "ht": ht, "goals": goals, "date": d}
        cache["days"][d] = now.isoformat(timespec="minutes")
        time.sleep(0.4)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{cache_path.relative_to(ROOT)} : {len(cache['matches'])} matchs")


if __name__ == "__main__":
    main()
