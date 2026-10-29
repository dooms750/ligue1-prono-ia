"""
Collecte les données de Ligue 1 sur OneFootball (édition française) dans
data/raw/onefootball_<saison>.json :

  - chaque match de la saison : date, score, buteurs (minute, penalty, csc),
    cartons rouges (minute), tirs, tirs cadrés, possession, titulaires ;
  - les matchs à venir (deux prochaines semaines) ;
  - pour chaque club, les derniers articles de la presse spécialisée française
    agrégés par OneFootball (titre, média, heure, lien).

Le script est poli : une requête toutes les 0,8 seconde, et seuls les matchs non
terminés sont re-téléchargés (les autres restent en cache).
Usage : python scripts/fetch_onefootball.py           collecte complète
        python scripts/fetch_onefootball.py --quick   matchs en cours ou terminés depuis peu
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BASE = "https://onefootball.com"
COMPETITION = "/fr/competition/ligue-1-23/resultats"
UA = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
}
DELAY = 0.8
NEWS_PER_TEAM = 25
NOW = datetime.now(timezone.utc)

_last = [0.0]


def get_next_data(path):
    """Télécharge une page OneFootball et renvoie son JSON __NEXT_DATA__."""
    wait = DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", errors="replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError(f"pas de données dans {path}")
    return json.loads(m.group(1))


def find(o, case, acc=None):
    """Toutes les briques d'un type donné ($case) dans la page."""
    acc = [] if acc is None else acc
    if isinstance(o, dict):
        if o.get("$case") == case and case in o:
            acc.append(o[case])
        for v in o.values():
            find(v, case, acc)
    elif isinstance(o, list):
        for v in o:
            find(v, case, acc)
    return acc


def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def minute(timeline):
    m = re.match(r"\s*(\d+)", timeline or "")
    return int(m.group(1)) if m else None


def link_path(link):
    if isinstance(link, dict):
        return link.get("urlPath")
    return link if isinstance(link, str) else None


def parse_match(mid, data):
    scores = find(data, "matchScore")
    if not scores:
        return None
    s = scores[0]
    comp = (s.get("competition") or {}).get("name", "")
    home, away = s.get("homeTeam") or {}, s.get("awayTeam") or {}
    out = {
        "id": mid,
        "competition": comp,
        "kickoff": (s.get("kickoff") or {}).get("utcTimestamp"),
        "status": s.get("timePeriod") or "",
        "period": s.get("period"),
        "home": home.get("name"), "away": away.get("name"),
        "homeLink": link_path(home.get("link")), "awayLink": link_path(away.get("link")),
        "hg": int(home["score"]) if str(home.get("score", "")).isdigit() else None,
        "ag": int(away["score"]) if str(away.get("score", "")).isdigit() else None,
        "goals": [], "reds": [], "stats": {}, "starters": {"home": [], "away": []},
    }
    events = find(data, "matchEvents")
    evs = events[0].get("events", []) if events else []
    halves = split_halves([minute(e.get("timeline")) for e in evs])
    for e, half in zip(evs, halves):
        t = e.get("type") or {}
        side = "home" if e.get("teamSide") == 0 else "away"
        if t.get("$case") == "goal":
            g = t["goal"]
            kind = {0: "but", 1: "csc", 2: "penalty", 3: "refuse"}.get(g.get("type"), "but")
            out["goals"].append({"side": side, "min": minute(e.get("timeline")), "half": half, "kind": kind,
                                 "player": (g.get("scorer") or {}).get("name")})
        elif t.get("$case") == "card" and t["card"].get("type") in (1, 2):
            out["reds"].append({"side": side, "min": minute(e.get("timeline")), "half": half,
                                "player": (t["card"].get("player") or {}).get("name")})
    stats = find(data, "matchStats")
    for st in (stats[0].get("stats", []) if stats else []):
        out["stats"][st.get("title")] = [st.get("home"), st.get("away")]
    lineups = find(data, "lineup")
    if lineups:
        for side in ("home", "away"):
            team = lineups[0].get(f"{side}Team") or {}
            for o in walk(team):
                if "jerseyNumber" in o and o.get("name"):
                    out["starters"][side].append(o["name"])
    return out


def split_halves(minutes):
    """Mi-temps de chaque événement, dans l'ordre chronologique de la page.

    OneFootball note le temps additionnel de la 1re mi-temps comme « 47' » au lieu de « 45+2' ».
    La 2e mi-temps commence au premier événement de la 46e minute ou plus qu'aucun événement
    plus tardif ne précède dans le temps (un « 47' » suivi d'un remplacement « 46' » est donc
    encore en 1re mi-temps)."""
    n = len(minutes)
    start = n
    for i, m in enumerate(minutes):
        if m is None or m < 46:
            continue
        later = [x for x in minutes[i + 1:] if x is not None]
        if not later or min(later) >= m:
            start = i
            break
    return [1 if (i < start or (m is not None and m <= 45)) else 2 for i, m in enumerate(minutes)]


CACHE_VERSION = 2  # 2 : mi-temps de chaque but et carton


def finished(m):
    st = (m.get("status") or "").lower()
    return m.get("hg") is not None and (m.get("period") == 11 or st.startswith("fin du match") or "après" in st)


def season_bounds(today):
    y = today.year if today.month >= 7 else today.year - 1
    return y, datetime(y, 7, 1, tzinfo=timezone.utc)


def is_ligue1(m, start):
    if not m or m.get("competition") != "Ligue 1" or not m.get("kickoff"):
        return False
    k = datetime.fromisoformat(m["kickoff"].replace("Z", "+00:00"))
    return k >= start


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    year, start = season_bounds(NOW)
    path = RAW / f"onefootball_{year % 100:02d}{(year + 1) % 100:02d}.json"
    cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"matches": {}, "news": {}}
    matches = cache["matches"]
    if cache.get("version") != CACHE_VERSION:
        # Nouveau format : on recharge toute la saison une fois.
        for m in matches.values():
            m["stale"] = True
        cache["version"] = CACHE_VERSION

    def fetch(mid):
        try:
            m = parse_match(mid, get_next_data(f"/fr/match/{mid}"))
        except Exception as e:  # page absente, réseau, format inattendu
            print(f"  match {mid} : {e}", file=sys.stderr)
            return None
        if is_ligue1(m, start):
            matches[str(mid)] = m
            return m
        return None

    print("OneFootball : liste des derniers résultats de Ligue 1")
    recent = []
    try:
        page = get_next_data(COMPETITION)
        for o in walk(page):
            if o.get("homeTeam") and o.get("awayTeam") and o.get("kickoff") and isinstance(o.get("link"), str):
                mm = re.search(r"/match/(\d+)", o["link"])
                if mm:
                    recent.append(int(mm.group(1)))
    except Exception as e:
        print(f"  page compétition : {e}", file=sys.stderr)
    known = sorted(set(recent) | {int(k) for k in matches})
    if not known:
        sys.exit("Impossible de trouver des matchs de Ligue 1 sur OneFootball.")

    quick = "--quick" in sys.argv

    def kicked_off_recently(i):
        m = matches.get(str(i))
        if not m or not m.get("kickoff"):
            return False
        ko = datetime.fromisoformat(m["kickoff"].replace("Z", "+00:00"))
        return NOW - timedelta(hours=5) < ko < NOW + timedelta(minutes=10)

    # 1. Matchs récents ou non terminés : (re)téléchargés.
    todo = [i for i in known if str(i) not in matches or not finished(matches[str(i)]) or matches[str(i)].get("stale")]
    if quick:
        # Mode rapide (pendant les matchs) : seulement ceux qui se jouent ou viennent de finir.
        todo = [i for i in todo if kicked_off_recently(i)]
    print(f"  {len(todo)} matchs à mettre à jour")
    for mid in todo:
        fetch(mid)

    if quick:
        cache["fetchedAt"] = NOW.isoformat(timespec="minutes")
        path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Mode rapide : {len(todo)} matchs mis à jour")
        return

    # 2. Début de saison : on remonte les identifiants tant qu'on trouve de la Ligue 1.
    if not cache.get("backfilled"):
        mid, misses = min(known) - 1, 0
        while misses < 4:
            misses = 0 if fetch(mid) else misses + 1
            mid -= 1
        cache["backfilled"] = True

    # 3. Matchs à venir : on avance jusqu'à deux semaines devant nous.
    horizon = NOW + timedelta(days=14)
    mid, misses = max(int(k) for k in matches) + 1, 0
    while misses < 4:
        m = fetch(mid)
        if m:
            misses = 0
            if datetime.fromisoformat(m["kickoff"].replace("Z", "+00:00")) > horizon:
                break
        else:
            misses += 1
        mid += 1

    # 4. La presse : derniers articles de chaque club.
    teams = {}
    for m in matches.values():
        for side in ("home", "away"):
            if m.get(f"{side}Link"):
                teams[m[side]] = m[f"{side}Link"]
    print(f"OneFootball : actus de {len(teams)} clubs")
    for name, team_path in sorted(teams.items()):
        try:
            data = get_next_data(team_path.rstrip("/") + "/news")
        except Exception as e:
            print(f"  actus {name} : {e}", file=sys.stderr)
            continue
        items, seen = [], set()
        for o in walk(data):
            if isinstance(o.get("title"), str) and "publisherName" in o and o.get("publishTimestamp"):
                url = link_path(o.get("link"))
                if not url or url in seen:
                    continue
                seen.add(url)
                items.append({"title": o["title"].strip(), "publisher": o.get("publisherName") or "",
                              "time": o["publishTimestamp"], "url": BASE + url if url.startswith("/") else url})
        items.sort(key=lambda x: x["time"], reverse=True)
        if items:
            cache["news"][name] = items[:NEWS_PER_TEAM]

    # 5. Le calendrier complet de chaque club, toutes compétitions (coupes d'Europe, Coupe de France).
    print(f"OneFootball : calendrier de {len(teams)} clubs, toutes compétitions")
    cache.setdefault("schedule", {})
    for name, team_path in sorted(teams.items()):
        games = []
        for tab in ("resultats", "matchs"):
            try:
                data = get_next_data(team_path.rstrip("/") + "/" + tab)
            except Exception as e:
                print(f"  calendrier {name} ({tab}) : {e}", file=sys.stderr)
                continue
            for o in walk(data):
                if o.get("homeTeam") and o.get("awayTeam") and isinstance(o.get("kickoff"), str) and isinstance(o.get("link"), str):
                    games.append({"kickoff": o["kickoff"], "competition": o.get("competitionName") or "",
                                  "home": (o["homeTeam"] or {}).get("name"), "away": (o["awayTeam"] or {}).get("name"),
                                  "link": o["link"]})
        if games:
            seen, uniq = set(), []
            for g in sorted(games, key=lambda g: g["kickoff"]):
                if g["link"] not in seen:
                    seen.add(g["link"])
                    uniq.append(g)
            cache["schedule"][name] = uniq

    cache["fetchedAt"] = NOW.isoformat(timespec="minutes")
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    done = sum(1 for m in matches.values() if finished(m))
    print(f"{path.relative_to(ROOT)} : {done} matchs terminés, {len(matches) - done} à venir, "
          f"actus de {len(cache['news'])} clubs")
    return {"count": len(matches), "finished": done}


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from health import record
    record("onefootball" + ("_quick" if "--quick" in sys.argv else ""), main)
