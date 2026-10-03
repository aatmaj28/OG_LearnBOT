"""Ask Agent: answers an employee's question about the codebase with path + line citations.

    run(message, employee_id, project_id=None, think=False)
      -> {answer, citations:[Chunk], unanswered:bool, steps:[str]}

SKELETON: returns a realistic sample answer. The LangGraph tool loop lands on AJ.
"""
from app.rag.sample import sample_chunks


def run(message, employee_id, project_id=None, think=False) -> dict:
    citations = sample_chunks(k=2, project_ids=[project_id] if project_id else None)
    return {
        "answer": "Search is in `Backend/app/rag/search.py` (lines 20-58): `search()` embeds the query with the "
                  "\"query: \" prefix and ranks the project's cached chunk vectors by cosine similarity. Chunks are "
                  "built in `Backend/app/rag/ingest.py` by `chunk_code()` (lines 41-96), one per function or class.",
        "citations": citations,
        "unanswered": False,
        "steps": ["search_knowledge(\"how does search work\")", "read_file(\"Backend/app/rag/search.py\")"],
    }
