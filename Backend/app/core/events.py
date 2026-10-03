"""Event log: one JSON object per line in DATA_DIR/events.jsonl (see CONTRACTS.md › Events).

    log_event("chat_question", "emp_demo", topic="Vector search", path="Backend/app/rag/search.py",
              project_id="proj_og_learnbot", details={"question": "..."})

Known fields go to the top level; anything else is merged into "details".
"""
import json
import threading
from datetime import datetime, timezone

from app.core.config import data_dir

TYPES = {"chat_question", "chat_unanswered", "file_view", "learn_attempt", "experience_feedback", "meeting_summary"}
_TOP_LEVEL = ("topic", "path", "project_id", "score")
_lock = threading.Lock()


def log_event(type: str, employee_id: str, **fields) -> dict:
    details = dict(fields.pop("details", None) or {})
    event = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "employee_id": employee_id,
        "type": type,
        **{k: fields.pop(k, None) for k in _TOP_LEVEL},
    }
    details.update(fields)
    event["details"] = details
    path = data_dir() / "events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with _lock, open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event
