"""Load employees, fake history and real events into one timeline.

Fake data (data/fake/) is generated relative to an anchor date; every fake
timestamp is shifted so the anchor lands on today, so the demo never looks stale.
"""
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2]


def data_dir() -> Path:
    env = os.getenv("DATA_DIR")
    if env:
        for p in (Path(env), _BACKEND_DIR.parent / env, _BACKEND_DIR / env):
            if p.is_dir():
                return p
    return _BACKEND_DIR / "data"


def parse_ts(ts) -> datetime:
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def _read_jsonl(path: Path) -> list[dict]:
    out = []
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except ValueError:
                        pass
    except OSError:
        pass
    return out


def _shift_days() -> int:
    meta = _read_json(data_dir() / "fake" / "meta.json", {})
    try:
        anchor = date.fromisoformat(meta["anchor"])
    except (KeyError, ValueError):
        return 0
    return (date.today() - anchor).days


def _shift_date(d, days):
    return (date.fromisoformat(d) + timedelta(days=days)).isoformat() if d else d


def load_employees() -> list[dict]:
    shift = _shift_days()
    emps = _read_json(data_dir() / "employees.json", [])
    return [{**e, "start_date": _shift_date(e.get("start_date"), shift)} for e in emps]


def load_topics() -> list[dict]:
    return _read_json(data_dir() / "fake" / "meta.json", {}).get("topics", [])


def load_tickets() -> dict:
    shift = _shift_days()
    raw = _read_json(data_dir() / "fake" / "tickets.json", {})
    out = {}
    for emp_id, t in raw.items():
        out[emp_id] = {
            "first_ticket_assigned": _shift_date(t.get("first_ticket_assigned"), shift),
            "first_pr_merged": _shift_date(t.get("first_pr_merged"), shift),
            "tickets": [{**k, "created": _shift_date(k.get("created"), shift),
                         "resolved": _shift_date(k.get("resolved"), shift)} for k in t.get("tickets", [])],
        }
    return out


def load_events() -> list[dict]:
    """Fake history + real events.jsonl, oldest first. Each event gets `_dt`."""
    shift = timedelta(days=_shift_days())
    events = []
    for e in _read_jsonl(data_dir() / "fake" / "events.jsonl"):
        e["_dt"] = parse_ts(e.get("ts")) + shift
        e["ts"] = e["_dt"].isoformat().replace("+00:00", "Z")
        events.append(e)
    for e in _read_jsonl(data_dir() / "events.jsonl"):
        e["_dt"] = parse_ts(e.get("ts"))
        e.setdefault("details", {})
        events.append(e)
    events.sort(key=lambda e: e["_dt"])
    return events


def public(e: dict) -> dict:
    return {k: v for k, v in e.items() if not k.startswith("_")}
