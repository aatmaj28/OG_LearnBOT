"""Full chat history per employee: every question and answer (with citations) in DATA_DIR/chats/{id}.jsonl.
Separate from core.memory, which only keeps the last 10 turns as model context."""
import json
import re
import threading
from datetime import datetime, timezone

from app.core.config import data_dir

_lock = threading.Lock()


def _path(employee_id):
    return data_dir() / "chats" / f"{re.sub(r'[^A-Za-z0-9_.-]', '_', employee_id)}.jsonl"


def append(employee_id, question, reply, project_id=None):
    rec = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
           "question": question, "project_id": project_id, **reply}
    p = _path(employee_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    with _lock, open(p, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def history(employee_id, limit=200):
    try:
        with open(_path(employee_id), encoding="utf-8") as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except OSError:
        return []
    return rows[-limit:]
