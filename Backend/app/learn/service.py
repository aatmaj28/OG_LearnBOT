"""Interactive learning: pick material, ask questions, grade answers against the source."""
import re
import threading
import uuid
from datetime import datetime, timezone

from app.analytics.data import load_topics
from app.core import events, llm, store
from app.rag import files as rag_files
from app.rag import search as rag_search

SESSIONS_FILE = "learn_sessions.json"
MAX_SESSIONS = 200
CHUNK_LINES = 60
MAX_MATERIAL = 4
PASS_SCORE = 0.6

_lock = threading.Lock()
_sessions: dict | None = None


class LearnError(Exception):
    pass


# ---------- sessions ----------

def _all() -> dict:
    global _sessions
    if _sessions is None:
        _sessions = store.read_json(SESSIONS_FILE, {}) or {}
    return _sessions


def _save(session: dict):
    with _lock:
        s = _all()
        s[session["id"]] = session
        if len(s) > MAX_SESSIONS:
            for k in sorted(s, key=lambda k: s[k]["created"])[: len(s) - MAX_SESSIONS]:
                del s[k]
        try:
            store.write_json(SESSIONS_FILE, s)
        except Exception:
            pass  # in-memory is enough for a demo


def get_session(session_id: str) -> dict:
    s = _all().get(session_id)
    if not s:
        raise LearnError("Unknown session_id")
    return s


# ---------- material ----------

def _normalize(c: dict, i: int) -> dict:
    return {
        "id": c.get("id") or f'{c.get("path", "chunk")}:{c.get("start_line", i)}',
        "source_type": c.get("source_type") or "code",
        "path": c.get("path") or "",
        "title": c.get("title") or (c.get("path") or "").split("/")[-1],
        "section": c.get("section") or "",
        "start_line": c.get("start_line") or 1,
        "end_line": c.get("end_line") or c.get("start_line") or 1,
        "text": c.get("text") or "",
        "score": c.get("score") or 0.0,
    }


def _chunk_file(path: str, text: str) -> list[dict]:
    lines = text.splitlines()
    is_doc = path.lower().endswith((".md", ".txt", ".rst"))
    chunks = []
    if is_doc:
        start, title = 0, path.split("/")[-1]
        for i, line in enumerate(lines + ["# end"]):
            if (re.match(r"^#{1,3} ", line) and i > start) or i == len(lines):
                body = "\n".join(lines[start:i]).strip()
                if body:
                    chunks.append({"source_type": "doc", "path": path, "section": title,
                                   "start_line": start + 1, "end_line": i, "text": body})
                start, title = i, line.lstrip("# ").strip()
    else:
        for i in range(0, len(lines), CHUNK_LINES):
            body = "\n".join(lines[i:i + CHUNK_LINES])
            if body.strip():
                chunks.append({"source_type": "code", "path": path, "section": "",
                               "start_line": i + 1, "end_line": min(i + CHUNK_LINES, len(lines)), "text": body})
    return [_normalize(c, i) for i, c in enumerate(chunks[:MAX_MATERIAL])]


def _material(topic: str | None, path: str | None) -> list[dict]:
    if path:
        try:
            f = rag_files.get_file(path)
        except Exception as e:
            raise LearnError(f"Could not open {path}: {e}")
        chunks = _chunk_file(f.get("path") or path, f.get("text") or "")
        if not chunks:
            raise LearnError(f"{path} is empty")
        return chunks
    if not topic:
        raise LearnError("Provide a topic or a path")
    hits = rag_search.search(topic, k=MAX_MATERIAL)
    if not hits:
        raise LearnError(f'Nothing in the knowledge base matches "{topic}"')
    return [_normalize(c, i) for i, c in enumerate(hits)]


# ---------- questions ----------

QUESTION_STYLE = {
    "code": ("This is source code. Ask practical engineering questions, one of each type: "
             "'explain' (what does a specific function/class do and why), "
             "'locate' (where would you change something to achieve a concrete goal), "
             "'impact' (what breaks or changes if a specific line/behavior is modified)."),
    "doc": ("This is documentation. Ask scenario questions a new hire will face on the job: "
            "'scenario' (you are doing X and Y happens, what do you do), "
            "'explain' (why does the process/rule exist), "
            "'apply' (which concrete value/command/step applies in a given situation)."),
}


def _material_block(material: list[dict]) -> str:
    parts = []
    for c in material:
        where = f'{c["path"]}:{c["start_line"]}-{c["end_line"]}' + (f' ({c["section"]})' if c["section"] else "")
        parts.append(f'[chunk_id={c["id"]}] {where}\n{c["text"][:3000]}')
    return "\n\n---\n\n".join(parts)


def _generate_questions(material: list[dict], label: str) -> list[dict]:
    kind = "doc" if sum(c["source_type"] == "doc" for c in material) > len(material) / 2 else "code"
    messages = [
        {"role": "system", "content": (
            "You create short comprehension checks for a new software engineer onboarding onto a codebase. "
            + QUESTION_STYLE[kind] +
            " Every question must be answerable ONLY from the material, refer to concrete names, and take "
            "1-3 sentences to answer. Return JSON: {\"questions\": [{\"q\": str, \"type\": str, "
            "\"answer\": str (the reference answer), \"key_points\": [str], \"chunk_id\": str}]} with exactly 3 questions.")},
        {"role": "user", "content": f"Topic: {label}\n\nMaterial:\n\n{_material_block(material)}"},
    ]
    ids = {c["id"] for c in material}
    try:
        data = llm.chat_json(messages, think=False)
        qs = []
        for q in (data or {}).get("questions", [])[:3]:
            if not isinstance(q, dict) or not str(q.get("q", "")).strip():
                continue
            qs.append({
                "q": str(q["q"]).strip(),
                "type": str(q.get("type") or ("explain" if kind == "code" else "scenario")),
                "answer": str(q.get("answer") or ""),
                "key_points": [str(k) for k in (q.get("key_points") or [])][:5],
                "chunk_id": q.get("chunk_id") if q.get("chunk_id") in ids else material[0]["id"],
            })
        if qs:
            return qs
    except Exception:
        pass
    return _fallback_questions(material, kind)


def _fallback_questions(material, kind) -> list[dict]:
    out = []
    for c in material[:3]:
        names = re.findall(r"(?:def|class|function|const)\s+([A-Za-z_][A-Za-z0-9_]*)", c["text"])
        where = f'{c["path"]} lines {c["start_line"]}-{c["end_line"]}'
        if kind == "code" and names:
            q = f"In {where}, what does `{names[0]}` do, and when is it called?"
        elif kind == "code":
            q = f"Summarize what the code in {where} is responsible for."
        else:
            q = f'According to {c["path"]}' + (f' ({c["section"]})' if c["section"] else "") + \
                ", what is the key rule or step a new engineer must follow?"
        out.append({"q": q, "type": "explain", "answer": "", "key_points": [], "chunk_id": c["id"]})
    return out


# ---------- grading ----------

def _grade(question: dict, chunk: dict, answer: str) -> dict:
    messages = [
        {"role": "system", "content": (
            "You grade a new engineer's answer strictly against the source material. Be encouraging but precise. "
            "Return JSON: {\"score\": number 0-1, \"correct\": bool (score >= 0.6), "
            "\"feedback\": str (2-3 sentences: what was right, what was missing or wrong, pointing to the exact "
            "place in the source), \"gap_concepts\": [str] (0-3 short noun phrases the person did not understand; "
            "empty if fully correct)}.")},
        {"role": "user", "content": (
            f'Source ({chunk["path"]}:{chunk["start_line"]}-{chunk["end_line"]}):\n{chunk["text"][:4000]}\n\n'
            f'Question: {question["q"]}\n'
            f'Reference answer: {question.get("answer") or "(derive from source)"}\n'
            f'Key points: {", ".join(question.get("key_points") or []) or "(derive from source)"}\n\n'
            f"Engineer's answer: {answer}")},
    ]
    try:
        g = llm.chat_json(messages, think=True) or {}
        score = max(0.0, min(1.0, float(g.get("score", 0))))
        return {
            "score": round(score, 2),
            "correct": score >= PASS_SCORE,
            "feedback": str(g.get("feedback") or "").strip() or "Graded.",
            "gap_concepts": [str(x) for x in (g.get("gap_concepts") or [])][:3],
        }
    except Exception:
        return _fallback_grade(question, chunk, answer)


def _words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-zA-Z_][a-zA-Z0-9_]{3,}", (s or "").lower())}


def _fallback_grade(question, chunk, answer) -> dict:
    got = _words(answer)
    ref = _words(question.get("answer") or " ".join(question.get("key_points") or []))
    if ref:
        score = len(ref & got) / max(3, min(len(ref), 8))
        missing = sorted(ref - got)[:3]
    else:
        # no reference answer: reward answers grounded in the source text
        score = len(got & _words(chunk["text"])) / 5
        missing = []
    score = round(min(1.0, score), 2)
    where = f'{chunk["path"]} lines {chunk["start_line"]}-{chunk["end_line"]}'
    return {
        "score": score, "correct": score >= PASS_SCORE,
        "feedback": ("Your answer matches the source." if score >= PASS_SCORE else
                     f"Re-read {where}." + (f' Look for: {", ".join(missing)}.' if missing else ""))
                    + " (Graded offline by keyword match; the model was unavailable.)",
        "gap_concepts": missing if score < PASS_SCORE else [],
    }


# ---------- public API ----------

def start(employee_id: str, topic: str | None = None, path: str | None = None) -> dict:
    material = _material(topic, path)
    if not topic and path:
        # map a file onto its catalog topic so analytics groups it with the fake history
        topic = next((t["topic"] for t in load_topics() if t["path"] == path), None)
    label = topic or path
    questions = _generate_questions(material, label)
    session = {
        "id": uuid.uuid4().hex[:12], "employee_id": employee_id, "topic": topic or path, "path": path,
        "label": label, "created": datetime.now(timezone.utc).isoformat(),
        "material": material,
        "questions": [{**q, "id": f"q{i + 1}"} for i, q in enumerate(questions)],
        "answers": {},
    }
    _save(session)
    return {
        "session_id": session["id"], "topic": label, "material": material,
        "questions": [{"id": q["id"], "q": q["q"], "type": q["type"]} for q in session["questions"]],
    }


def answer(session_id: str, question_id: str, answer_text: str) -> dict:
    s = get_session(session_id)
    q = next((q for q in s["questions"] if q["id"] == question_id), None)
    if not q:
        raise LearnError("Unknown question_id")
    if not (answer_text or "").strip():
        raise LearnError("Answer is empty")
    chunk = next((c for c in s["material"] if c["id"] == q["chunk_id"]), s["material"][0])
    g = _grade(q, chunk, answer_text)
    result = {**g, "citation": chunk, "reference_answer": q.get("answer") or None}

    s["answers"][question_id] = {"answer": answer_text, **g}
    _save(s)
    events.log_event(
        "learn_attempt", s["employee_id"],
        topic=s["topic"], path=chunk["path"], score=g["score"],
        details={"session_id": session_id, "question_id": question_id, "question": q["q"],
                 "answer": answer_text, "correct": g["correct"], "gap_concepts": g["gap_concepts"],
                 "section": chunk["section"] or None, "source_type": chunk["source_type"],
                 "start_line": chunk["start_line"], "end_line": chunk["end_line"]},
    )
    return result
