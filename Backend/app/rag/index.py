"""Per-source embedding indexes cached in DATA_DIR/index/{name}/ (chunks.json + vectors.npy).

Sources: each project repo (Backend/data/repos/{project_id}), plus "_docs" (data/docs) and "_meetings"
(data/meetings). Vectors are L2-normalized so search is a dot product.
"""
import json
import os
import threading

import numpy as np

from app.core.config import data_dir
from app.core.embed import embed
from app.rag import ingest

_cache: dict = {}  # name -> (mtime, chunks, vectors)
_lock = threading.Lock()


def index_dir(name):
    return data_dir() / "index" / name


def repo_dir(project_id):
    return data_dir() / "repos" / project_id


def _embed_chunks(chunks):
    texts = [f"{c['path']} {c['section']}\n{c['text']}"[:2000] for c in chunks]
    v = np.asarray(embed(texts, kind="passage"), dtype=np.float32) if texts else np.zeros((0, 1), np.float32)
    if len(v):
        v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
    return v


def build(name, root, project_id=None, source_type=None):
    """Chunks and embeds every indexable file under root; returns {"files", "chunks"}."""
    project_id = project_id or name
    chunks, files = [], 0
    if os.path.isdir(root):
        for rel in ingest.walk(str(root)):
            text = ingest.read_text(os.path.join(root, rel))
            if text and text.strip():
                files += 1
                chunks += ingest.chunk_file(project_id, rel, text, source_type)
    vectors = _embed_chunks(chunks)
    d = index_dir(name)
    d.mkdir(parents=True, exist_ok=True)
    np.save(d / "vectors.npy", vectors)
    with open(d / "chunks.json", "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False)
    with _lock:
        _cache.pop(name, None)
    return {"files": files, "chunks": len(chunks)}


def build_project(project_id):
    return build(project_id, repo_dir(project_id), project_id)


def build_extras():
    """data/docs and data/meetings (P3's {id}.md files)."""
    return {"_docs": build("_docs", data_dir() / "docs", "_docs", "doc"),
            "_meetings": build("_meetings", data_dir() / "meetings", "_meetings", "meeting")}


def load(name):
    d = index_dir(name)
    try:
        mtime = os.path.getmtime(d / "chunks.json")
    except OSError:
        return [], np.zeros((0, 1), np.float32)
    with _lock:
        hit = _cache.get(name)
        if hit and hit[0] == mtime:
            return hit[1], hit[2]
    with open(d / "chunks.json", encoding="utf-8") as f:
        chunks = json.load(f)
    vectors = np.load(d / "vectors.npy")
    with _lock:
        _cache[name] = (mtime, chunks, vectors)
    return chunks, vectors


def names():
    d = data_dir() / "index"
    return sorted(p.name for p in d.iterdir() if (p / "chunks.json").exists()) if d.is_dir() else []
