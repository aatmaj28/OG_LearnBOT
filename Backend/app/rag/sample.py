"""Realistic sample chunks (Chunk shape from CONTRACTS.md), used by the skeleton stubs and as a fallback when
the model or the index isn't available, so callers always get a valid shape."""

DEMO_PROJECT_ID = "proj_og_learnbot"

SAMPLE_CHUNKS = [
    {
        "id": f"{DEMO_PROJECT_ID}:Backend/app/rag/search.py:20-58",
        "project_id": DEMO_PROJECT_ID,
        "source_type": "code",
        "path": "Backend/app/rag/search.py",
        "title": "search.py",
        "section": "search()",
        "start_line": 20,
        "end_line": 58,
        "text": "def search(query, k=6, sources=None, project_ids=None):\n"
                "    \"\"\"Cosine search over the cached chunk embeddings, scoped by project.\"\"\"\n"
                "    q = np.asarray(embed([query], kind=\"query\")[0])\n"
                "    ...",
        "score": 0.83,
    },
    {
        "id": f"{DEMO_PROJECT_ID}:Backend/app/rag/ingest.py:41-96",
        "project_id": DEMO_PROJECT_ID,
        "source_type": "code",
        "path": "Backend/app/rag/ingest.py",
        "title": "ingest.py",
        "section": "chunk_code()",
        "start_line": 41,
        "end_line": 96,
        "text": "def chunk_code(path, text):\n"
                "    \"\"\"Split source code by function/class (or ~60 lines), keeping line numbers.\"\"\"\n"
                "    ...",
        "score": 0.79,
    },
    {
        "id": f"{DEMO_PROJECT_ID}:README.md:30-52",
        "project_id": DEMO_PROJECT_ID,
        "source_type": "doc",
        "path": "README.md",
        "title": "README.md",
        "section": "Local development › SSH tunnel",
        "start_line": 30,
        "end_line": 52,
        "text": "## Local development\n\n### SSH tunnel\n"
                "ssh -N -L 21434:127.0.0.1:11434 -L 8100:127.0.0.1:8100 -L 18000:127.0.0.1:8000 dell@172.20.65.152",
        "score": 0.74,
    },
]


def sample_chunks(k=6, project_ids=None):
    chunks = [c for c in SAMPLE_CHUNKS if not project_ids or c["project_id"] in project_ids]
    return [dict(c) for c in chunks[:k]]
