"""Meeting Minutes Agent: turns a meeting transcript into structured minutes.

    summarize(title, attendees:[str], transcript)
      -> {summary, decisions:[], action_items:[{owner,task,due}], notes:[], open_questions:[]}

One chat_json call with think=True. Long transcripts (over LONG_CHARS) are map-reduced: each part is condensed
with think=False, then the notes are merged with think=True. Falls back to sample minutes if the model fails.
"""
from app.core import llm

LONG_CHARS = 24_000
PART_CHARS = 12_000
SCHEMA = ('{"summary": "2-4 sentences", "decisions": ["..."], '
          '"action_items": [{"owner": "name", "task": "...", "due": "date or empty"}], '
          '"notes": ["..."], "open_questions": ["..."]}')


def _system(title, attendees):
    return (f"You write meeting minutes for the meeting \"{title}\" (attendees: {', '.join(attendees) or 'unknown'}). "
            "Use only what was said. Keep the speakers' language for names and technical terms; write the minutes "
            f"in English. Reply with only this JSON object:\n{SCHEMA}\nUse empty lists when there is nothing.")


def _normalize(d):
    items = []
    for a in d.get("action_items") or []:
        if isinstance(a, dict):
            items.append({"owner": str(a.get("owner") or "Unassigned"), "task": str(a.get("task") or ""),
                          "due": str(a.get("due") or "")})
        elif a:
            items.append({"owner": "Unassigned", "task": str(a), "due": ""})
    as_list = lambda v: [str(x) for x in v] if isinstance(v, list) else ([str(v)] if v else [])
    return {"summary": str(d.get("summary") or ""), "decisions": as_list(d.get("decisions")),
            "action_items": [i for i in items if i["task"]], "notes": as_list(d.get("notes")),
            "open_questions": as_list(d.get("open_questions"))}


def _condense(title, part, n, total):
    return llm.chat([{"role": "system", "content": f"Condense part {n}/{total} of the meeting \"{title}\" into "
                      "bullet notes: decisions, action items with owners and dates, open questions, key facts."},
                     {"role": "user", "content": part}], think=False)


def summarize(title, attendees, transcript) -> dict:
    attendees = list(attendees or [])
    text = transcript or ""
    try:
        if len(text) > LONG_CHARS:
            parts = [text[i:i + PART_CHARS] for i in range(0, len(text), PART_CHARS)]
            text = "\n\n".join(f"Part {n}:\n{_condense(title, p, n, len(parts))}" for n, p in enumerate(parts, 1))
        d = llm.chat_json([{"role": "system", "content": _system(title, attendees)},
                           {"role": "user", "content": f"Transcript:\n{text}"}], think=True)
        return _normalize(d)
    except Exception:
        from app.agents import _meeting_sample
        return _meeting_sample.summarize(title, attendees, transcript)
