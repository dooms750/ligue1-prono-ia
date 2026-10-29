"""
Journal de santé de la collecte : data/raw/health.json.

Chaque script de collecte passe par record(nom, fonction). On note l'heure de la tentative,
celle du dernier succès, le nombre d'éléments collectés et l'erreur éventuelle. L'app affiche
ce journal, pour voir d'un coup d'œil si une source a cessé de répondre.
"""

import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "health.json"


def _load():
    try:
        return json.loads(PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def record(name, fn):
    now = datetime.now(timezone.utc).isoformat(timespec="minutes")
    h = _load()
    entry = h.get(name, {})
    entry["lastAttempt"] = now
    try:
        info = fn() or {}
    except SystemExit as e:
        if e.code in (None, 0):
            info = {}
        else:
            entry.update(ok=False, error=str(e.code)[:300], failures=entry.get("failures", 0) + 1)
            h[name] = entry
            _save(h)
            raise
    except Exception as e:  # noqa: BLE001
        entry.update(ok=False, error=f"{type(e).__name__}: {e}"[:300], failures=entry.get("failures", 0) + 1)
        h[name] = entry
        _save(h)
        traceback.print_exc()
        sys.exit(1)
    partial = bool(info.get("errors"))
    entry.update(ok=True, lastOk=now, failures=0, error=None, partial=partial, **{k: v for k, v in info.items()})
    h[name] = entry
    _save(h)


def _save(h):
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(h, ensure_ascii=False, indent=1), encoding="utf-8")
