"""Semantic search over indexed chunks (see CONTRACTS.md › Shared Python helpers).

SKELETON: returns sample chunks. The real version (numpy cosine search over per-project embeddings) lands on AJ.
"""
from app.rag.sample import sample_chunks


def search(query, k=6, sources=None, project_ids=None) -> list[dict]:
    chunks = sample_chunks(k=k, project_ids=project_ids)
    if sources:
        chunks = [c for c in chunks if c["source_type"] in sources]
    return chunks
