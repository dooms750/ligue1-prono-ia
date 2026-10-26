"""
Télécharge les vraies données de Ligue 1 depuis football-data.co.uk dans data/raw/ :

  F1_<saison>.csv       résultats de la saison en cours (scores, mi-temps, xG, cartons, cotes)
  F1_<saison-1>.csv     résultats de la saison précédente (pour démarrer le modèle)
  fixtures_F1.csv       matchs à venir de la semaine, avec leurs cotes

Si un téléchargement échoue, le fichier déjà présent est conservé.
Usage : python scripts/fetch_data.py
"""

import csv
import io
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BASE = "https://www.football-data.co.uk"
UA = {"User-Agent": "Mozilla/5.0 (Lucide; projet open source de pronostics expliqués)"}

KEEP_RESULTS = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "HTHG", "HTAG",
                "HxG", "AxG", "HR", "AR", "AvgH", "AvgD", "AvgA"]
KEEP_FIXTURES = ["Div", "Date", "Time", "HomeTeam", "AwayTeam", "AvgH", "AvgD", "AvgA"]


def season_code(d):
    """2026-27 -> '2627'. La saison bascule en juillet."""
    y = d.year if d.month >= 7 else d.year - 1
    return f"{y % 100:02d}{(y + 1) % 100:02d}"


def download(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8-sig", errors="replace")


def keep_columns(text, cols, row_filter=None):
    reader = csv.DictReader(io.StringIO(text))
    present = [c for c in cols if c in (reader.fieldnames or [])]
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=present, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    n = 0
    for row in reader:
        if not row.get("HomeTeam"):
            continue
        if row_filter and not row_filter(row):
            continue
        w.writerow(row)
        n += 1
    return out.getvalue(), n


def save(name, url, cols, row_filter=None):
    try:
        text, n = keep_columns(download(url), cols, row_filter)
    except Exception as e:  # réseau, site indisponible, format inattendu
        print(f"  {name} : échec ({e}), fichier existant conservé", file=sys.stderr)
        return False
    (RAW / name).write_text(text, encoding="utf-8")
    print(f"  {name} : {n} lignes")
    return True


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    today = date.today()
    cur = season_code(today)
    prev = season_code(date(today.year - 1, today.month, 1))
    print("Téléchargement des données Ligue 1 (football-data.co.uk)")
    ok = save(f"F1_{cur}.csv", f"{BASE}/mmz4281/{cur}/F1.csv", KEEP_RESULTS)
    if not (RAW / f"F1_{prev}.csv").exists():
        save(f"F1_{prev}.csv", f"{BASE}/mmz4281/{prev}/F1.csv", KEEP_RESULTS)
    save("fixtures_F1.csv", f"{BASE}/fixtures.csv", KEEP_FIXTURES, lambda r: r.get("Div") == "F1")
    if not ok and not (RAW / f"F1_{cur}.csv").exists():
        sys.exit("Aucune donnée de la saison en cours disponible.")


if __name__ == "__main__":
    main()
