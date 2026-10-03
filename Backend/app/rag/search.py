"""Semantic search over indexed chunks (see CONTRACTS.md › Shared Python helpers).

    search(query, k=6, sources=None, project_ids=None) -> list[Chunk]

project_ids scopes project code/docs (None = every project); sources filters source_type ("code", "doc",
"meeting"). Extra docs and meetings are always searchable regardless of project_ids. If nothing is indexed or
the embedding service is down, returns sample chunks so callers still get a valid shape.
"""
import numpy as np

from app.core.embed import embed
from app.rag import index
from app.rag.sample import sample_chunks


def search(query, k=6, sources=None, project_ids=None) -> list[dict]:
    names = [n for n in index.names() if n.startswith("_") or project_ids is None or n in project_ids
             or (n.startswith("ctx_") and n[4:] in project_ids)]  # manager-provided project context
    pool, vecs = [], []
    for n in names:
        chunks, v = index.load(n)
        if len(chunks):
            pool += chunks
            vecs.append(v)
    if not pool:
        return sample_chunks(k=k, project_ids=project_ids)
    q = np.asarray(embed([query], kind="query")[0], dtype=np.float32)
    q /= np.linalg.norm(q) + 1e-9
    scores = np.concatenate(vecs) @ q
    out = []
    for i in np.argsort(-scores):
        c = pool[i]
        if sources and c["source_type"] not in sources:
            continue
        out.append({**c, "score": round(float(scores[i]), 4)})
        if len(out) >= k:
            break
    return out
