"""Meeting storage: DATA_DIR/meetings/{id}.json (full record) + {id}.md (minutes, indexed for search)."""
import json
import re
import uuid
from datetime import datetime, timezone

from app.core.config import data_dir


def meetings_dir():
    d = data_dir() / "meetings"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _markdown(m):
    mm = m["minutes"]
    lines = [f"# {m['title']}", "", f"Date: {m['created'][:10]} · Attendees: {', '.join(m['attendees']) or '-'}", "",
             "## Summary", mm["summary"], "", "## Decisions", *[f"- {d}" for d in mm["decisions"]], "",
             "## Action items", *[f"- {a['owner']}: {a['task']}" + (f" (due {a['due']})" if a["due"] else "")
                                  for a in mm["action_items"]], "",
             "## Notes", *[f"- {n}" for n in mm["notes"]], "",
             "## Open questions", *[f"- {q}" for q in mm["open_questions"]]]
    return "\n".join(lines) + "\n"


def save(title, attendees, transcript, minutes):
    ts = datetime.now(timezone.utc)
    mid = f"mtg_{ts.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"
    m = {"id": mid, "title": title, "attendees": attendees,
         "created": ts.isoformat(timespec="seconds").replace("+00:00", "Z"), "transcript": transcript, "minutes": minutes}
    (meetings_dir() / f"{mid}.json").write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
    (meetings_dir() / f"{mid}.md").write_text(_markdown(m), encoding="utf-8")
    return m


def list_meetings():
    out = []
    for f in sorted(meetings_dir().glob("mtg_*.json"), reverse=True):
        try:
            m = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        out.append({"id": m["id"], "title": m["title"], "attendees": m["attendees"], "created": m["created"],
                    "summary": m["minutes"]["summary"], "action_items": len(m["minutes"]["action_items"])})
    return out


def get(mid):
    if not re.fullmatch(r"mtg_[A-Za-z0-9_]+", mid):
        return None
    f = meetings_dir() / f"{mid}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
