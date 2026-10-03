"""Generate deterministic fake onboarding history for the Learn + Manager demo.

Writes:
  data/employees.json        new hires (+ the demo employee emp_demo)
  data/fake/events.jsonl     same schema as data/events.jsonl
  data/fake/tickets.json     Jira-like tickets and onboarding milestones
  data/fake/meta.json        anchor date; analytics shifts all fake dates so the
                             anchor lines up with "today" (data never goes stale)

Run:  python Backend/data/fake/generate.py
"""
import json
import random
import zlib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SEED = 42
ANCHOR = date(2026, 10, 3)
FAKE_DIR = Path(__file__).resolve().parent
DATA_DIR = FAKE_DIR.parent

# Topics map onto the demo repository (LearnBOT itself). `trap` marks doc sections
# that most people misread -> they should surface in "Docs to improve".
TOPICS = [
    {"topic": "RAG ingestion & chunking", "source_type": "code", "path": "Backend/app/rag/ingest.py",
     "section": "chunk_code()", "difficulty": 0.10,
     "gaps": ["line-number tracking", "chunk boundaries by function/class", "markdown heading split"],
     "questions": ["How are code files split into chunks?", "Why do chunks keep start_line and end_line?",
                   "Where do I add support for .ipynb files in ingestion?"]},
    {"topic": "Vector search", "source_type": "code", "path": "Backend/app/rag/search.py",
     "section": "search()", "difficulty": 0.05,
     "gaps": ["cosine similarity with numpy", "index cache invalidation", "filtering by source_type"],
     "questions": ["How does search rank chunks?", "When is the index rebuilt?",
                   "Can I search only meeting notes?"]},
    {"topic": "Chat API & citations", "source_type": "code", "path": "Backend/app/routers/chat.py",
     "section": "POST /api/chat", "difficulty": 0.0,
     "gaps": ["unanswered detection", "citation format", "event logging per question"],
     "questions": ["How does the chat endpoint decide a question is unanswered?",
                   "What does a citation contain?", "Where are chat questions logged?"]},
    {"topic": "LLM helper & think mode", "source_type": "code", "path": "Backend/app/core/llm.py",
     "section": "chat_json()", "difficulty": 0.15,
     "gaps": ["think=False disables reasoning", "JSON retry on parse failure", "OpenAI-compatible base URL"],
     "questions": ["When should I pass think=True?", "What happens if the model returns invalid JSON?",
                   "Which client talks to the local model?"]},
    {"topic": "Embeddings & prefixes", "source_type": "doc", "path": "CONTRACTS.md",
     "section": "Env › EMBED_MODEL", "difficulty": 0.10, "trap": 0.25,
     "gaps": ["query: vs passage: prefixes", "EMBED_URL differs in prod", "OLLAMA_PROXY_TOKEN header"],
     "questions": ["Do I need to add the query: prefix myself?", "Why do my embeddings return 401 in prod?",
                   "Which embed URL do I use inside the sandbox?", "What prefix do documents get?"]},
    {"topic": "GB10 deployment", "source_type": "doc", "path": "SETUP-GB10.md",
     "section": "10. openshell exec over SSH", "difficulty": 0.15, "trap": 0.28,
     "gaps": ["< /dev/null with openshell exec", "offline wheel install from /sandbox/python-wheels",
              "restarting uvicorn in tmux"],
     "questions": ["Why does deploy.sh hang at openshell exec?", "How do I install a Python package in the sandbox?",
                   "How do I restart the backend on the GB10?", "Where are the offline wheels?"]},
    {"topic": "Dev tunnel & env setup", "source_type": "doc", "path": "README.md",
     "section": "Local development › SSH tunnel", "difficulty": 0.05, "trap": 0.25,
     "gaps": ["port 21434 maps to Ollama 11434", "voice port 8100 is browser-only", "LLM_BASE_URL differs in prod"],
     "questions": ["Which port is the model on locally?", "Why can't the backend reach the voice service?",
                   "What goes in my .env for local dev?"]},
    {"topic": "Event logging", "source_type": "code", "path": "Backend/app/core/events.py",
     "section": "log_event()", "difficulty": 0.0,
     "gaps": ["events.jsonl schema", "event types", "employee_id on every event"],
     "questions": ["What fields does every event have?", "Which event types exist?"]},
    {"topic": "Voice button (WAV only)", "source_type": "code", "path": "Frontend/components/voice/VoiceButton.tsx",
     "section": "encodeWav()", "difficulty": 0.10,
     "gaps": ["16 kHz mono 16-bit WAV", "why MediaRecorder webm is rejected", "speakText triggers /tts"],
     "questions": ["Why is my recording rejected by /stt?", "How does speakText work?"]},
    {"topic": "Frontend routing", "source_type": "code", "path": "Frontend/app/layout.tsx",
     "section": "RootLayout", "difficulty": -0.05,
     "gaps": ["static export served by FastAPI", "route stubs per owner"],
     "questions": ["Where do I add a new page?", "How is the frontend served in prod?"]},
]

# skill: baseline understanding. activity: chance of being active on a given day.
# inactive_days: days since last activity. repeat_topic: keeps asking about one topic.
EMPLOYEES = [
    ("emp_demo", "Alex Rivera", "Backend Engineer", 9, 0.72, 0.85, 0, None),
    ("emp_001", "Priya Nair", "Backend Engineer", 24, 0.84, 0.80, 0, None),
    ("emp_002", "Marcus Chen", "Frontend Engineer", 18, 0.70, 0.75, 1, None),
    ("emp_003", "Sofia Alvarez", "QA Engineer", 15, 0.58, 0.70, 0, None),
    ("emp_004", "Jordan Lee", "Data Engineer", 21, 0.38, 0.55, 1, "GB10 deployment"),        # struggling
    ("emp_005", "Aisha Bello", "Backend Engineer", 12, 0.78, 0.80, 0, None),
    ("emp_006", "Ravi Kulkarni", "Data Engineer", 27, 0.81, 0.65, 0, None),
    ("emp_007", "Emma Schultz", "Frontend Engineer", 8, 0.62, 0.70, 0, None),
    ("emp_008", "Daniel Okafor", "QA Engineer", 19, 0.52, 0.45, 6, None),                     # inactive
    ("emp_009", "Mei Tanaka", "Backend Engineer", 5, 0.74, 0.90, 0, None),
    ("emp_010", "Lucas Moreau", "Frontend Engineer", 30, 0.88, 0.60, 0, None),
    ("emp_011", "Fatima Zahra", "Data Engineer", 11, 0.35, 0.80, 0, "Embeddings & prefixes"),  # struggling
    ("emp_012", "Noah Patel", "QA Engineer", 3, 0.70, 0.90, 0, None),
    ("emp_013", "Hannah Berg", "Backend Engineer", 14, 0.69, 0.75, 2, None),
]

MANAGERS = {
    "Backend Engineer": ("Dana Whitfield", "delivery"),
    "Data Engineer": ("Dana Whitfield", "delivery"),
    "Frontend Engineer": ("Rahul Menon", "program"),
    "QA Engineer": ("Rahul Menon", "program"),
}

ROLE_TOPICS = {
    "Backend Engineer": ["RAG ingestion & chunking", "Vector search", "Chat API & citations",
                         "LLM helper & think mode", "Embeddings & prefixes", "Event logging",
                         "GB10 deployment", "Dev tunnel & env setup"],
    "Data Engineer": ["RAG ingestion & chunking", "Vector search", "Embeddings & prefixes",
                      "Event logging", "GB10 deployment", "Dev tunnel & env setup"],
    "Frontend Engineer": ["Frontend routing", "Voice button (WAV only)", "Chat API & citations",
                          "Dev tunnel & env setup", "Event logging"],
    "QA Engineer": ["Chat API & citations", "Event logging", "Dev tunnel & env setup",
                    "GB10 deployment", "Frontend routing", "Voice button (WAV only)"],
}

TICKET_TITLES = {
    "Backend Engineer": ["Add retries to chat_json", "Return file line ranges in citations",
                         "Cache embeddings per file hash", "Log chat latency in events"],
    "Data Engineer": ["Index meeting notes", "Dedupe chunks across docs",
                      "Nightly re-index job", "Embedding drift check"],
    "Frontend Engineer": ["Citation chips open file at line", "Loading state for chat",
                          "Dark mode for files page", "Keyboard shortcut for voice"],
    "QA Engineer": ["Smoke test /api/chat", "Regression suite for learn flow",
                    "Voice WAV upload test", "Deploy health check script"],
}

UNDERSTOOD = {
    "code": ["The chunking code was easy to follow", "Citations with line numbers helped a lot",
             "The search function is short and clear"],
    "doc": ["The architecture overview", "The API contract list"],
}
COMMENTS_GOOD = ["Chat answers with file links saved me hours.", "The learning checks made me actually read the code.",
                 "Felt productive by day 3.", "Great to ask questions without bothering the team."]
COMMENTS_BAD = ["The GB10 deploy docs skip steps; I got stuck on openshell exec.",
                "Not clear when to add the query:/passage: prefixes.",
                "Tunnel instructions assume I already know which ports map where.",
                "Too much to read in week one, a checklist would help."]


def iso(d: date, rng: random.Random) -> str:
    t = datetime(d.year, d.month, d.day, rng.randint(9, 18), rng.randint(0, 59), rng.randint(0, 59),
                 tzinfo=timezone.utc)
    return t.isoformat().replace("+00:00", "Z")


def main():
    rng = random.Random(SEED)
    topics = {t["topic"]: t for t in TOPICS}
    employees, events, tickets = [], [], {}

    for emp_id, name, role, days_in, skill, activity, inactive_days, repeat_topic in EMPLOYEES:
        manager, manager_type = MANAGERS[role]
        start = ANCHOR - timedelta(days=days_in)
        employees.append({
            "id": emp_id, "name": name, "role": role, "start_date": start.isoformat(),
            "manager": manager, "manager_type": manager_type,
            "email": f"{name.split()[0].lower()}@learnbot.dev",
            "learning_path": ROLE_TOPICS[role],
        })
        my_topics = ROLE_TOPICS[role]
        last_active = ANCHOR - timedelta(days=inactive_days)
        day, n_active = start, 0
        while day <= last_active:
            is_last = day == last_active
            if day.weekday() < 5 and (rng.random() < activity or is_last):
                n_active += 1
                # progress through topics roughly in order, revisiting older ones
                frontier = min(len(my_topics), 1 + n_active // 2)
                for _ in range(rng.randint(0, 2)):
                    t = topics[rng.choice(my_topics[:frontier])]
                    q = rng.choice(t["questions"])
                    events.append(ev(day, rng, emp_id, "chat_question", t, details={"question": q}))
                    if rng.random() < 0.12 + t.get("trap", 0) * 0.8:
                        events.append(ev(day, rng, emp_id, "chat_unanswered", t, details={"question": q}))
                    if rng.random() < 0.6:
                        events.append(ev(day, rng, emp_id, "file_view", t))
                for _ in range(rng.randint(0, 2)):
                    t = topics[rng.choice(my_topics[:frontier])]
                    learning = min(0.15, 0.01 * n_active)
                    score = skill + learning - t["difficulty"] - t.get("trap", 0) + rng.gauss(0, 0.12)
                    score = round(max(0.0, min(1.0, score)), 2)
                    gaps = rng.sample(t["gaps"], k=1 if score > 0.6 else 2) if score < 0.8 else []
                    events.append(ev(day, rng, emp_id, "learn_attempt", t, score=score,
                                     details={"question": rng.choice(t["questions"]), "gap_concepts": gaps,
                                              "correct": score >= 0.6}))
                if repeat_topic and rng.random() < 0.8:
                    t = topics[repeat_topic]
                    for _ in range(rng.randint(1, 2)):
                        q = rng.choice(t["questions"])
                        events.append(ev(day, rng, emp_id, "chat_question", t, details={"question": q}))
                        if rng.random() < 0.5:
                            events.append(ev(day, rng, emp_id, "chat_unanswered", t, details={"question": q}))
            day += timedelta(days=1)

        # experience feedback: one per ~week
        for k in range(max(1, days_in // 8)):
            fday = min(last_active, start + timedelta(days=4 + 7 * k))
            rating = max(1, min(5, round(1 + skill * 4 + rng.gauss(0, 0.6))))
            traps = [t for t in TOPICS if t.get("trap") and t["topic"] in my_topics]
            confusing = [f'{t["path"]} › {t["section"]}' for t in rng.sample(traps, k=min(len(traps), rng.randint(1, 2)))]
            st = rng.choice(["code", "doc"])
            events.append({
                "ts": iso(fday, rng), "employee_id": emp_id, "type": "experience_feedback",
                "topic": None, "path": None, "score": rating / 5,
                "details": {"rating": rating, "understood": rng.sample(UNDERSTOOD[st], k=1),
                            "confusing": confusing,
                            "comment": rng.choice(COMMENTS_GOOD if rating >= 4 else COMMENTS_BAD)},
            })

        tickets[emp_id] = make_tickets(emp_id, role, start, days_in, skill, rng)

    events.sort(key=lambda e: e["ts"])
    (DATA_DIR / "employees.json").write_text(json.dumps(employees, indent=2) + "\n")
    with open(FAKE_DIR / "events.jsonl", "w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")
    (FAKE_DIR / "tickets.json").write_text(json.dumps(tickets, indent=2) + "\n")
    (FAKE_DIR / "meta.json").write_text(json.dumps({
        "anchor": ANCHOR.isoformat(),
        "topics": [{k: t[k] for k in ("topic", "source_type", "path", "section")} for t in TOPICS],
    }, indent=2) + "\n")
    print(f"{len(employees)} employees, {len(events)} events")


def ev(day, rng, emp_id, type_, t, score=None, details=None):
    return {"ts": iso(day, rng), "employee_id": emp_id, "type": type_, "topic": t["topic"],
            "path": t["path"], "score": score,
            "details": {"section": t["section"], "source_type": t["source_type"], **(details or {})}}


def make_tickets(emp_id, role, start, days_in, skill, rng):
    out = []
    first_assigned = start + timedelta(days=2) if days_in >= 3 else None
    first_merged = None
    for i, title in enumerate(TICKET_TITLES[role]):
        created = start + timedelta(days=2 + i * 5)
        if created > ANCHOR:
            break
        age = (ANCHOR - created).days
        speed = 3 + (1 - skill) * 8 + rng.random() * 2
        if age > speed:
            status, resolved = "done", created + timedelta(days=round(speed))
            if first_merged is None:
                first_merged = resolved
        elif age > speed * 0.6:
            status, resolved = "in_review", None
        else:
            status, resolved = "in_progress", None
        out.append({"key": f"LB-{100 + zlib.crc32((emp_id + title).encode()) % 900}", "title": title, "status": status,
                    "created": created.isoformat(), "resolved": resolved.isoformat() if resolved else None})
    return {
        "first_ticket_assigned": first_assigned.isoformat() if first_assigned else None,
        "first_pr_merged": first_merged.isoformat() if first_merged else None,
        "tickets": out,
    }


if __name__ == "__main__":
    main()
