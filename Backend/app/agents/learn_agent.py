"""Learn Agent: interactive learning on project material, graded against the source.

    start(employee_id, topic=None, path=None, project_id=None)
      -> {session_id, material:[Chunk], questions:[{id,q,type}]}
    answer(session_id, question_id, answer)
      -> {correct:bool, score:0-1, feedback, gap_concepts:[str], citation:Chunk,
          next:"reteach"|"next"|"done", reteach:str|null}

SKELETON: returns realistic sample data. The LangGraph state machine lands on AJ.
"""
import uuid

from app.rag.sample import sample_chunks

_QUESTIONS = [
    {"id": "q1", "q": "What does search() do with the query before comparing it to the chunks?", "type": "code_purpose"},
    {"id": "q2", "q": "Where would you change the code to return 10 results instead of 6?", "type": "code_change"},
    {"id": "q3", "q": "What breaks if the \"passage: \" prefix is dropped when indexing?", "type": "code_impact"},
]


def start(employee_id, topic=None, path=None, project_id=None) -> dict:
    return {
        "session_id": f"learn_{uuid.uuid4().hex[:12]}",
        "material": sample_chunks(k=2, project_ids=[project_id] if project_id else None),
        "questions": [dict(q) for q in _QUESTIONS],
    }


def answer(session_id, question_id, answer) -> dict:
    citation = sample_chunks(k=1)[0]
    return {
        "correct": False,
        "score": 0.5,
        "feedback": "Partly right: the query is embedded, but you missed that it gets the \"query: \" prefix first, "
                    "which the embedding model needs to match it against passages.",
        "gap_concepts": ["query/passage prefixes"],
        "citation": citation,
        "next": "reteach",
        "reteach": "nemotron-embed-1b-v2 is trained on prefixed text: questions as \"query: ...\" and documents as "
                   "\"passage: ...\". search() adds the query prefix (search.py lines 20-58), so its vector lands "
                   "near the indexed passages.",
    }
