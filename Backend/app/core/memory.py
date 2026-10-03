"""Per-employee chat memory: the last 10 turns (user + assistant pairs), in DATA_DIR/memory/{employee_id}.json."""
import re
import threading
from datetime import datetime, timezone

from app.core import store

MAX_TURNS = 10
_lock = threading.Lock()


def _name(employee_id: str) -> str:
    return f"memory/{re.sub(r'[^A-Za-z0-9_.-]', '_', employee_id)}.json"


def history(employee_id: str) -> list[dict]:
    """Chat messages ({"role", "content"}) for the last MAX_TURNS turns, oldest first."""
    turns = store.read_json(_name(employee_id), [])
    return [{"role": m["role"], "content": m["content"]} for m in turns[-2 * MAX_TURNS:]]


def add_turn(employee_id: str, question: str, answer: str) -> None:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    with _lock:
        turns = store.read_json(_name(employee_id), [])
        turns += [{"role": "user", "content": question, "ts": ts}, {"role": "assistant", "content": answer, "ts": ts}]
        store.write_json(_name(employee_id), turns[-2 * MAX_TURNS:])


def clear(employee_id: str) -> None:
    store.write_json(_name(employee_id), [])
