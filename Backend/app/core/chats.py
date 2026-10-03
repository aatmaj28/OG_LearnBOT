"""Chat conversations per employee, like ChatGPT/Claude threads.

DATA_DIR/chats/{employee_id}/{conversation_id}.json = {"id", "title", "created", "updated", "messages": [entry]}
where entry = {"ts", "question", "answer", "citations", "unanswered", "steps", "project_id"}.
The Ask Agent's model context is the last MAX_TURNS turns of the current conversation only.
A pre-conversation flat history file (chats/{employee_id}.jsonl) is migrated once into "Earlier chats".
"""
import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone

from app.core.config import data_dir

MAX_TURNS = 10
_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _safe(s):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", s)


def _dir(employee_id):
    d = data_dir() / "chats" / _safe(employee_id)
    d.mkdir(parents=True, exist_ok=True)
    _migrate(employee_id, d)
    return d


def _migrate(employee_id, d):
    old = data_dir() / "chats" / f"{_safe(employee_id)}.jsonl"
    if not old.exists():
        return
    with open(old, encoding="utf-8") as f:
        rows = [json.loads(l) for l in f if l.strip()]
    if rows:
        conv = {"id": "conv_earlier", "title": "Earlier chats", "created": rows[0]["ts"], "updated": rows[-1]["ts"],
                "messages": rows}
        _write(d, conv)
    old.rename(old.with_suffix(".jsonl.migrated"))


def _write(d, conv):
    p = d / f"{conv['id']}.json"
    tmp = p.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(conv, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def get(employee_id, conversation_id):
    if not conversation_id or not re.fullmatch(r"conv_[A-Za-z0-9_]+", conversation_id):
        return None
    p = _dir(employee_id) / f"{conversation_id}.json"
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def list_conversations(employee_id):
    out = []
    for p in _dir(employee_id).glob("conv_*.json"):
        try:
            c = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        out.append({"id": c["id"], "title": c["title"], "created": c["created"], "updated": c["updated"],
                    "messages": len(c["messages"])})
    return sorted(out, key=lambda c: c["updated"], reverse=True)


def recent_messages(employee_id, conversation_id):
    """Model context: the last MAX_TURNS question/answer pairs of this conversation."""
    c = get(employee_id, conversation_id)
    msgs = []
    for e in (c["messages"] if c else [])[-MAX_TURNS:]:
        msgs += [{"role": "user", "content": e["question"]}, {"role": "assistant", "content": e["answer"]}]
    return msgs


def append(employee_id, conversation_id, question, reply, project_id=None):
    """Adds a turn; starts a new conversation (titled from the question) if conversation_id is unknown."""
    with _lock:
        c = get(employee_id, conversation_id)
        if c is None:
            title = re.sub(r"\s+", " ", question).strip()
            c = {"id": f"conv_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}",
                 "title": title[:60] + ("…" if len(title) > 60 else ""), "created": _now(), "messages": []}
        entry = {"ts": _now(), "question": question, "project_id": project_id, **reply}
        c["messages"].append(entry)
        c["updated"] = entry["ts"]
        _write(_dir(employee_id), c)
        return c


def delete(employee_id, conversation_id):
    c = get(employee_id, conversation_id)
    if c:
        (_dir(employee_id) / f"{c['id']}.json").unlink(missing_ok=True)
    return bool(c)


def history(employee_id, limit=200):
    """Every turn across all conversations, oldest first (with its conversation_id)."""
    rows = []
    for meta in list_conversations(employee_id):
        c = get(employee_id, meta["id"])
        rows += [{**e, "conversation_id": c["id"]} for e in c["messages"]]
    return sorted(rows, key=lambda e: e["ts"])[-limit:]
