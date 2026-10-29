"""
Prévisions météo de chaque match, publiées de 7 jours à 2 jours avant le coup d'envoi
(puis affinées jusqu'au match), avec un indice de confiance. Résultat : data/raw/weather.json.

Deux sources, toutes deux servies gratuitement par Open-Meteo (https://open-meteo.com) :
  - la prévision d'ensemble ECMWF : 51 scénarios calculés en parallèle. La part des
    scénarios qui annoncent de la pluie ou du vent donne une probabilité, et leur accord
    donne la confiance ;
  - la prévision Météo-France (AROME / ARPEGE) quand le match est à moins de 4 jours,
    pour la température et le ciel annoncés.

L'indice de confiance (0 à 100) combine l'accord des scénarios et l'échéance : une
prévision à 7 jours est par nature moins sûre qu'une prévision à 2 jours. Chaque jour,
la prévision est ajoutée à l'historique du match pour voir comment elle évolue.
Usage : python scripts/fetch_weather.py
"""

import json
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onefootball_source import OF_NAMES, kickoff, paris  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DETERMINISTIC = "https://api.open-meteo.com/v1/forecast"
ENSEMBLE = "https://ensemble-api.open-meteo.com/v1/ensemble"
FIRST_DAY = 7.5   # première prévision publiée : 7 jours avant le match
UA = {"User-Agent": "Lucide (projet open source de pronostics expliqués)"}

# Stade de chaque club : nom, latitude, longitude, toit fermé ou rétractable.
STADIUMS = {
    "PSG": ("Parc des Princes", 48.8414, 2.2530, False),
    "OM": ("Orange Vélodrome", 43.2698, 5.3959, False),
    "OL": ("Groupama Stadium", 45.7653, 4.9820, False),
    "MON": ("Stade Louis-II", 43.7276, 7.4156, False),
    "LIL": ("Stade Pierre-Mauroy", 50.6119, 3.1305, True),
    "LEN": ("Stade Bollaert-Delelis", 50.4329, 2.8150, False),
    "REN": ("Roazhon Park", 48.1075, -1.7128, False),
    "NIC": ("Allianz Riviera", 43.7053, 7.1926, False),
    "STR": ("Stade de la Meinau", 48.5602, 7.7553, False),
    "BRE": ("Stade Francis-Le Blé", 48.4029, -4.4617, False),
    "TOU": ("Stadium de Toulouse", 43.5833, 1.4340, False),
    "PFC": ("Stade Jean-Bouin", 48.8433, 2.2527, False),
    "LOR": ("Stade du Moustoir", 47.7489, -3.3693, False),
    "ANG": ("Stade Raymond-Kopa", 47.4605, -0.5307, False),
    "AUX": ("Stade de l'Abbé-Deschamps", 47.7867, 3.5886, False),
    "HAV": ("Stade Océane", 49.4988, 0.1697, False),
    "LMA": ("MMArena", 47.9589, 0.2242, False),
    "TRO": ("Stade de l'Aube", 48.3075, 4.0989, False),
}

WMO = {
    0: "ciel dégagé", 1: "plutôt dégagé", 2: "partiellement nuageux", 3: "couvert",
    45: "brouillard", 48: "brouillard givrant", 51: "bruine légère", 53: "bruine", 55: "bruine forte",
    56: "bruine verglaçante", 57: "bruine verglaçante", 61: "pluie faible", 63: "pluie", 65: "forte pluie",
    66: "pluie verglaçante", 67: "pluie verglaçante", 71: "neige faible", 73: "neige", 75: "forte neige",
    77: "grains de neige", 80: "averses", 81: "averses", 82: "fortes averses", 85: "averses de neige",
    86: "fortes averses de neige", 95: "orage", 96: "orage et grêle", 99: "orage et grêle",
}

RAIN_MM = 1.5   # pluie cumulée sur le match au-delà de laquelle le jeu ralentit
GUST_KMH = 55   # rafales qui gênent les centres, les longs ballons et les frappes


def get(url, params):
    req = urllib.request.Request(f"{url}?{urllib.parse.urlencode(params)}", headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


def match_hours(times, ko_local):
    """Index des heures du match : du coup d'envoi à deux heures après."""
    start = ko_local.replace(minute=0)
    wanted = [(start + timedelta(hours=k)).strftime("%Y-%m-%dT%H:00") for k in range(3)]
    return [times.index(t) for t in wanted if t in times]


def ensemble(lat, lon, ko_local):
    day = f"{ko_local:%Y-%m-%d}"
    data = get(ENSEMBLE, {"latitude": lat, "longitude": lon, "models": "ecmwf_ifs025",
                          "hourly": "precipitation,wind_gusts_10m,temperature_2m",
                          "timezone": "Europe/Paris", "start_date": day, "end_date": day})
    h = data["hourly"]
    idx = match_hours(h["time"], ko_local)
    if not idx:
        return None

    def members(var):
        return [k for k in h if k == var or k.startswith(var + "_member")]

    rain = [sum(h[k][i] or 0 for i in idx) for k in members("precipitation") if h[k][idx[0]] is not None]
    gust = [max(h[k][i] or 0 for i in idx) for k in members("wind_gusts_10m") if h[k][idx[0]] is not None]
    temp = [h[k][idx[0]] for k in members("temperature_2m") if h[k][idx[0]] is not None]
    if not rain or not temp:
        return None
    return {
        "n": len(rain),
        "pRain": sum(r >= RAIN_MM for r in rain) / len(rain),
        "pWind": sum(g >= GUST_KMH for g in gust) / len(gust) if gust else 0.0,
        "rain": round(statistics.median(rain), 1),
        "rainMax": round(max(rain), 1),
        "gust": round(statistics.median(gust)) if gust else None,
        "temp": round(statistics.median(temp)),
        "tempSpread": round(statistics.pstdev(temp), 1),
    }


def deterministic(lat, lon, ko_local, days):
    """Ciel annoncé : Météo-France à moins de 4 jours, modèle mondial au-delà."""
    day = f"{ko_local:%Y-%m-%d}"
    for model, label in (("meteofrance_seamless", "Météo-France"), ("best_match", "modèle mondial")):
        if model == "meteofrance_seamless" and days > 4.2:
            continue
        try:
            data = get(DETERMINISTIC, {"latitude": lat, "longitude": lon, "models": model,
                                       "hourly": "temperature_2m,precipitation,wind_speed_10m,weather_code",
                                       "timezone": "Europe/Paris", "start_date": day, "end_date": day})
        except Exception as e:
            print(f"    {model} : {e}", file=sys.stderr)
            continue
        h = data["hourly"]
        idx = [i for i in match_hours(h["time"], ko_local) if h["temperature_2m"][i] is not None]
        if idx:
            codes = [h["weather_code"][i] for i in idx if h["weather_code"][i] is not None]
            code = max(codes) if codes else None
            return {"model": label, "temp": round(h["temperature_2m"][idx[0]]),
                    "rain": round(sum(h["precipitation"][i] or 0 for i in idx), 1),
                    "wind": round(max(h["wind_speed_10m"][i] or 0 for i in idx)),
                    "code": code, "desc": WMO.get(code, "")}
        time.sleep(0.3)
    return None


def confidence(ens, days):
    """Indice de 0 à 100 : accord des 51 scénarios, pondéré par l'échéance."""
    agree_rain = (max(ens["pRain"], 1 - ens["pRain"]) - 0.5) * 2      # 0 = partagés, 1 = unanimes
    agree_wind = (max(ens["pWind"], 1 - ens["pWind"]) - 0.5) * 2
    agree_temp = max(0.0, 1 - ens["tempSpread"] / 4)
    agreement = 0.55 * agree_rain + 0.25 * agree_wind + 0.20 * agree_temp
    lead = min(1.0, max(0.6, 1 - 0.065 * (days - 1)))                # 7 jours : 0,61 ; 2 jours : 0,94
    score = round(100 * (0.3 + 0.7 * agreement) * lead)
    label = "forte" if score >= 70 else "moyenne" if score >= 45 else "faible"
    return score, label


def main():
    files = sorted(RAW.glob("onefootball_*.json"))
    if not files:
        sys.exit("Pas de cache OneFootball : lance d'abord scripts/fetch_onefootball.py")
    cache = json.loads(files[-1].read_text(encoding="utf-8"))
    path = RAW / "weather.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    now = datetime.now(timezone.utc)
    today = paris(now).strftime("%Y-%m-%d")
    out = {}

    for m in cache["matches"].values():
        h, a = OF_NAMES.get(m["home"]), OF_NAMES.get(m["away"])
        if not h or not a or h not in STADIUMS or not m.get("kickoff"):
            continue
        ko = kickoff(m)
        local = paris(ko).replace(tzinfo=None)
        key = f"{local:%Y-%m-%d}-{h}-{a}"
        days = (ko - now).total_seconds() / 86400
        if days < -0.2 or days > FIRST_DAY:
            # Match passé : on garde sa dernière prévision quelques jours pour le débrief.
            if key in previous and -4 < days < 0:
                out[key] = previous[key]
            continue
        name, lat, lon, roof = STADIUMS[h]
        try:
            ens = ensemble(lat, lon, local)
        except Exception as e:
            print(f"  {key} : ensemble indisponible ({e})", file=sys.stderr)
            ens = None
        if not ens:
            if key in previous:
                out[key] = previous[key]
            continue
        det = deterministic(lat, lon, local, days)
        score, label = confidence(ens, days)
        kind = "beau"
        if not roof:
            if ens["pRain"] >= 0.5:
                kind = "pluie"
            elif ens["pWind"] >= 0.5:
                kind = "vent"
        cal_days = (local.date() - paris(now).date()).days  # jours calendaires avant le match
        snapshot = {"day": today, "daysBefore": cal_days, "pRain": round(ens["pRain"], 2),
                    "pWind": round(ens["pWind"], 2), "temp": ens["temp"], "conf": score}
        history = [s for s in previous.get(key, {}).get("history", []) if s["day"] != today] + [snapshot]
        out[key] = {
            "kind": kind, "stadium": name, "roof": roof, "daysBefore": cal_days,
            "temp": det["temp"] if det else ens["temp"], "desc": det["desc"] if det else "",
            "code": det["code"] if det else None,
            "rain": ens["rain"], "rainMax": ens["rainMax"], "gust": ens["gust"],
            "pRain": round(ens["pRain"], 2), "pWind": round(ens["pWind"], 2), "members": ens["n"],
            "confidence": score, "confidenceLabel": label,
            "sources": ["ECMWF (51 scénarios)"] + ([f"{det['model']}"] if det else []),
            "updated": now.isoformat(timespec="minutes"),
            "history": history[-8:],
        }
        print(f"  {key} J-{cal_days} {name} : pluie {round(ens['pRain'] * 100)} %, "
              f"rafales {ens['gust']} km/h, {out[key]['temp']}°C -> {kind}, confiance {score} ({label})")
        time.sleep(0.4)

    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"data/raw/weather.json : {len(out)} matchs")
    return {"count": len(out)}


if __name__ == "__main__":
    from health import record
    record("weather", main)
