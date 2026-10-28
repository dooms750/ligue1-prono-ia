"""
Transforme le cache OneFootball (data/raw/onefootball_<saison>.json) en matchs
joués, matchs à venir et contexte de presse, au format attendu par build_data.py.
"""

import csv
import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Noms OneFootball -> codes de l'app.
OF_NAMES = {
    "PSG": "PSG", "Olympique Lyonnais": "OL", "Toulouse FC": "TOU", "ESTAC Troyes": "TRO",
    "Stade Rennais": "REN", "RC Strasbourg": "STR", "Olympique de Marseille": "OM",
    "Le Havre AC": "HAV", "AJ Auxerre": "AUX", "Le Mans FC": "LMA", "Angers SCO": "ANG",
    "FC Lorient": "LOR", "AS Monaco": "MON", "LOSC": "LIL", "RC Lens": "LEN",
    "Paris FC": "PFC", "Stade Brestois": "BRE", "OGC Nice": "NIC",
}

# Mots de la presse qui signalent une absence ou un doute.
ABSENCE = re.compile(
    r"bless|forfait|absen|suspendu|suspension|incertain|infirmerie|indisponible|touch[ée]|"
    r"manquera|\bforfait|\bout\b|ménag|rechute|claquage|entorse|lésion|opéré|opération|ischio|cuisse|genou|cheville|mollet",
    re.I,
)
# Mots qui annoncent au contraire un retour.
RETURN = re.compile(r"retour|de retour|revient|apte|rétabli|reprend", re.I)

# Façons dont la presse désigne chaque club (sans accents, en minuscules).
ALIASES = {
    "PSG": ["psg", "paris saint-germain", "paris sg", "parisien"], "OL": ["ol", "lyon", "lyonnais", "gones"],
    "OM": ["om", "marseille", "olympien", "phoceen"], "MON": ["monaco", "asm", "monegasque"],
    "LIL": ["losc", "lille", "lillois", "dogues"], "LEN": ["lens", "lensois", "sang et or"],
    "REN": ["rennes", "stade rennais", "rennais", "srfc"], "NIC": ["nice", "ogc nice", "nicois", "aiglons"],
    "STR": ["strasbourg", "racing", "rcsa", "strasbourgeois"], "BRE": ["brest", "brestois", "stade brestois", "sb29"],
    "TOU": ["toulouse", "tfc", "toulousain", "violets"], "PFC": ["paris fc", "pfc"],
    "LOR": ["lorient", "fcl", "lorientais", "merlus"], "ANG": ["angers", "sco", "angevin"],
    "AUX": ["auxerre", "aja", "auxerrois"], "HAV": ["le havre", "havre", "hac", "havrais"],
    "LMA": ["le mans", "manceau", "manceaux"], "TRO": ["troyes", "estac", "troyen"],
}

# Compétitions qui fatiguent : coupes d'Europe et Coupe de France, avec leur nom court.
CUPS = {
    "UEFA Champions League": "Ligue des champions", "UEFA Europa League": "Ligue Europa",
    "UEFA Conference League": "Ligue Conférence", "UEFA Europa Conference League": "Ligue Conférence",
    "UEFA Ligue Conférence": "Ligue Conférence", "UEFA Ligue des Champions": "Ligue des champions",
    "UEFA Ligue Europa": "Ligue Europa", "Coupe de France": "Coupe de France", "Trophée des Champions": "Trophée des champions",
}
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

SHOTS_ON_TARGET = "Tirs cadrés"
SOT_TO_GOALS = 0.31  # en Ligue 1, environ 0,3 but par tir cadré


def fold(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return s.lower()


def kickoff(m):
    return datetime.fromisoformat(m["kickoff"].replace("Z", "+00:00"))


def paris(dt):
    """Heure de Paris (UTC+1 l'hiver, UTC+2 l'été, changement le dernier dimanche de mars et d'octobre)."""
    def last_sunday(y, month):
        d = datetime(y, month + 1, 1, tzinfo=timezone.utc) - timedelta(days=1) if month < 12 else datetime(y, 12, 31, tzinfo=timezone.utc)
        return d - timedelta(days=(d.weekday() + 1) % 7)
    y = dt.year
    summer_start = last_sunday(y, 3).replace(hour=1)
    summer_end = last_sunday(y, 10).replace(hour=1)
    return dt + timedelta(hours=2 if summer_start <= dt < summer_end else 1)


def fix_goal_sides(m):
    """Vérifie l'équipe créditée de chaque but (les csc peuvent être notés côté fautif)."""
    goals = [g for g in m["goals"] if g["kind"] != "refuse"]
    def count(gs):
        return sum(g["side"] == "home" for g in gs), sum(g["side"] == "away" for g in gs)
    if count(goals) == (m["hg"], m["ag"]):
        return goals
    flipped = [{**g, "side": "away" if g["side"] == "home" else "home"} if g["kind"] == "csc" else g for g in goals]
    return flipped if count(flipped) == (m["hg"], m["ag"]) else goals


def first_half(g):
    if g.get("half") in (1, 2):
        return g["half"] == 1
    return (g.get("min") or 99) <= 45


def load_halftime(raw):
    """Scores à la pause publiés par football-data.co.uk : la référence quand ils existent."""
    from build_data import CSV_NAMES
    ht = {}
    for f in sorted(raw.glob("F1_*.csv"))[-1:]:
        for row in csv.DictReader(open(f, encoding="utf-8-sig")):
            h, a = CSV_NAMES.get(row.get("HomeTeam")), CSV_NAMES.get(row.get("AwayTeam"))
            try:
                ht[(h, a)] = (int(row["HTHG"]), int(row["HTAG"]))
            except (KeyError, TypeError, ValueError):
                pass
    return ht


def load_odds(raw):
    """Cotes du marché (complément football-data.co.uk), par affiche domicile-extérieur."""
    from build_data import CSV_NAMES  # import tardif : évite une boucle
    odds = {}
    for f in sorted(raw.glob("F1_*.csv"))[-1:] + [raw / "fixtures_F1.csv"]:
        if not f.exists():
            continue
        for row in csv.DictReader(open(f, encoding="utf-8-sig")):
            h, a = CSV_NAMES.get(row.get("HomeTeam")), CSV_NAMES.get(row.get("AwayTeam"))
            try:
                o = [float(row["AvgH"]), float(row["AvgD"]), float(row["AvgA"])]
            except (KeyError, TypeError, ValueError):
                continue
            if h and a:
                odds[(h, a)] = o
    return odds


def top_scorers(played):
    """Meilleur buteur de chaque club sur la saison (hors csc)."""
    tally = {}
    for m in played:
        for g in m.get("scorers", []):
            if g["kind"] == "csc" or not g.get("player"):
                continue
            team = m["home"] if g["side"] == "home" else m["away"]
            tally.setdefault(team, {}).setdefault(g["player"], 0)
            tally[team][g["player"]] += 1
    return {t: max(p.items(), key=lambda x: x[1]) for t, p in tally.items()}


def first_club(text):
    """Le club cité en premier dans un titre (souvent le sujet de l'article)."""
    best = None
    for code, names in ALIASES.items():
        for a in names:
            m = re.search(rf"(?<![a-z]){re.escape(a)}(?![a-z])", text)
            if m and (best is None or m.start() < best[0]):
                best = (m.start(), code)
    return best[1] if best else None


def about_team(title, team, players):
    """Le titre concerne-t-il ce club ? Il doit citer un de ses joueurs, ou le club en premier."""
    t = fold(title)
    for p in players:
        last = fold(p.split()[-1])
        if len(last) > 3 and re.search(rf"\b{re.escape(last)}\b", t):
            return True
    return first_club(t) == team


def press_context(team, news, scorer, now, players=(), since=None):
    """Articles parus depuis le dernier match du club qui parlent d'absences, et si le meilleur buteur semble concerné."""
    since = since or now - timedelta(days=6)
    recent = [n for n in news if datetime.fromisoformat(n["time"].replace("Z", "+00:00")) > since
              and about_team(n["title"], team, players)]
    flagged, scorer_out = [], None
    last_name = fold(scorer[0].split()[-1]) if scorer else None
    for n in recent:
        t = n["title"]
        if not ABSENCE.search(t):
            continue
        item = {"title": t, "publisher": n["publisher"], "url": n["url"], "time": n["time"]}
        if last_name and len(last_name) > 2 and re.search(rf"\b{re.escape(last_name)}\b", fold(t)) and not RETURN.search(t):
            item["about"] = "buteur"
            scorer_out = scorer_out or item
        flagged.append(item)
    # Un retour annoncé après l'absence annule le signal.
    if scorer_out and last_name:
        for n in recent:
            if n["time"] > scorer_out["time"] and RETURN.search(n["title"]) and re.search(rf"\b{re.escape(last_name)}\b", fold(n["title"])):
                scorer_out = None
                break
    seen = {f["url"] for f in flagged}
    general = [{"title": n["title"], "publisher": n["publisher"], "url": n["url"], "time": n["time"]}
               for n in recent if n["url"] not in seen][:3]
    return flagged[:4], scorer_out, general


def midweek_game(schedule, team_name, league_ko):
    """Match de coupe joué entre 4,5 jours et 12 heures avant le match de Ligue 1."""
    for g in schedule.get(team_name, []):
        comp = CUPS.get(g.get("competition"))
        if not comp:
            continue
        ko = datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00"))
        gap = (league_ko - ko).total_seconds() / 3600
        if 12 <= gap <= 108:
            opp = g["away"] if g["home"] == team_name else g["home"]
            local = paris(ko)
            return {"competition": comp, "opponent": opp, "day": JOURS[local.weekday()],
                    "home": g["home"] == team_name, "hoursBefore": round(gap)}
    return None


def build_onefootball(path, raw):
    cache = json.loads(Path(path).read_text(encoding="utf-8"))
    all_m = [m for m in cache["matches"].values()
             if OF_NAMES.get(m["home"]) and OF_NAMES.get(m["away"]) and m.get("kickoff")]
    all_m.sort(key=lambda m: m["id"])
    # Les identifiants OneFootball suivent l'ordre des journées : 9 matchs par journée.
    for rank, m in enumerate(all_m):
        m["md"] = rank // 9 + 1

    odds = load_odds(raw)
    halftime = load_halftime(raw)
    espn = {}
    for f in sorted(Path(raw).glob("espn_*.json"))[-1:]:
        for k, v in json.loads(f.read_text(encoding="utf-8")).get("matches", {}).items():
            espn[tuple(k.split("-"))] = v
    now = datetime.now(timezone.utc)
    played, pending = [], []
    for m in all_m:
        h, a = OF_NAMES[m["home"]], OF_NAMES[m["away"]]
        ko = paris(kickoff(m))
        base = {"md": m["md"], "date": ko.strftime("%Y-%m-%d"), "time": ko.strftime("%H:%M"),
                "home": h, "away": a, "odds": odds.get((h, a)), "src": f"https://onefootball.com/fr/match/{m['id']}"}
        st = (m.get("status") or "").lower()
        done = m.get("hg") is not None and (m.get("period") == 11 or st.startswith("fin du match") or "après" in st)
        if not done:
            pending.append({**base, "_m": m})
            continue
        goals = fix_goal_sides(m)
        # Mi-temps de chaque but : ESPN (qui note « 45'+2' ») corrige l'estimation OneFootball.
        e = espn.get((h, a))
        if e and (e["hg"], e["ag"]) == (m["hg"], m["ag"]):
            for side in ("home", "away"):
                ours = [g for g in goals if g["side"] == side]
                theirs = [x for x in e.get("goals", []) if x["side"] == side]
                if len(ours) == len(theirs):
                    for g, x in zip(sorted(ours, key=lambda g: g["min"] or 0), theirs):
                        mm = re.match(r"(\d+)'?(?:\+(\d+))?", x.get("clock") or "")
                        if mm:
                            g["half"] = 1 if int(mm.group(1)) <= 45 else 2
        sot = m.get("stats", {}).get(SHOTS_ON_TARGET)
        reds = m.get("reds", [])
        red_h = next((r["min"] or 1 for r in reds if r["side"] == "home"), None)
        red_a = next((r["min"] or 1 for r in reds if r["side"] == "away"), None)
        played.append({
            **base, "hg": m["hg"], "ag": m["ag"],
            "htH": sum(1 for g in goals if g["side"] == "home" and first_half(g)),
            "htA": sum(1 for g in goals if g["side"] == "away" and first_half(g)),
            "sotH": sot[0] if sot else None, "sotA": sot[1] if sot else None,
            # Les tirs cadrés servent d'indicateur de la qualité des occasions.
            "xgH": round(sot[0] * SOT_TO_GOALS, 2) if sot else None,
            "xgA": round(sot[1] * SOT_TO_GOALS, 2) if sot else None,
            "redH": red_h, "redA": red_a,
            "goals": [["H" if g["side"] == "home" else "A", g["min"] or 0] for g in goals],
            "htSource": "football-data" if (h, a) in halftime else "onefootball",
            "scorers": [{"side": g["side"], "player": g["player"], "kind": g["kind"], "min": g["min"], "half": g.get("half")} for g in goals],
        })

    # Score à la pause : football-data.co.uk fait foi, puis ESPN (qui note « 45'+2' »),
    # puis l'ordre des événements OneFootball.
    for pm in played:
        key = (pm["home"], pm["away"])
        e = espn.get(key)
        if key in halftime:
            pm["htH"], pm["htA"] = halftime[key]
            pm["htSource"] = "football-data"
        elif e and (e["hg"], e["ag"]) == (pm["hg"], pm["ag"]):
            pm["htH"], pm["htA"] = e["ht"]
            pm["htSource"] = "espn"

    # À venir : les matchs non joués des deux prochaines semaines (ou de la prochaine journée).
    pending.sort(key=lambda x: (x["date"], x["time"]))
    if pending:
        first_md = min(p["md"] for p in pending)
        horizon = (now + timedelta(days=9)).strftime("%Y-%m-%d")
        pending = [p for p in pending if p["md"] <= first_md + 1 and (p["md"] == first_md or p["date"] <= horizon)]

    weather_file = Path(raw) / "weather.json"
    weather = json.loads(weather_file.read_text(encoding="utf-8")) if weather_file.exists() else {}
    scorers = top_scorers(played)
    # Joueurs de chaque club, vus dans les compos et parmi les buteurs de la saison.
    last_game = {}
    for m in all_m:
        if m.get("hg") is not None and (m.get("period") == 11 or (m.get("status") or "").lower().startswith("fin du match")):
            for side in ("home", "away"):
                code = OF_NAMES[m[side]]
                last_game[code] = max(last_game.get(code, kickoff(m)), kickoff(m))
    players = {}
    for m in all_m:
        for side in ("home", "away"):
            code = OF_NAMES[m[side]]
            players.setdefault(code, set()).update(m.get("starters", {}).get(side, []))
    for m in played:
        for g in m.get("scorers", []):
            if g.get("player") and g["kind"] != "csc":
                players.setdefault(m["home"] if g["side"] == "home" else m["away"], set()).add(g["player"])
    news = {OF_NAMES.get(k): v for k, v in cache.get("news", {}).items() if OF_NAMES.get(k)}
    upcoming = []
    schedule = cache.get("schedule", {})
    for p in pending:
        m0 = p.pop("_m")
        ctx = {"known": True, "absH": [], "absA": [], "europeH": False, "europeA": False,
               "weather": "inconnu", "press": {}}
        for side, team in (("H", p["home"]), ("A", p["away"])):
            flagged, scorer_out, general = press_context(
                team, news.get(team, []), scorers.get(team), now, players.get(team, ()),
                since=last_game.get(team, now - timedelta(days=6)) + timedelta(hours=2))
            sc = scorers.get(team)
            ctx["press"][side] = {
                "absences": flagged, "other": general,
                "scorer": {"name": sc[0], "goals": sc[1]} if sc else None,
                "scorerOut": scorer_out,
            }
            if scorer_out:
                ctx[f"abs{side}"].append("buteur")
        for side, name in (("H", m0["home"]), ("A", m0["away"])):
            mw = midweek_game(schedule, name, kickoff(m0))
            if mw:
                ctx[f"europe{side}"] = True
                ctx[f"cup{side}"] = mw
        w = weather.get(f"{p['date']}-{p['home']}-{p['away']}")
        if w:
            ctx["weather"] = w["kind"]
            ctx["meteo"] = w
        if not news:
            ctx["known"] = False
        upcoming.append({**p, "ctx": ctx})
    return played, upcoming, cache.get("fetchedAt")
