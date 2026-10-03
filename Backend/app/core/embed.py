"""Embeddings from Ollama's /api/embed (see CONTRACTS.md › Shared Python helpers).

    embed(["how is a chunk built?"], kind="query") -> [[...2048 floats...]]

nemotron-embed-1b-v2 expects "query: " / "passage: " prefixes. In the GB10 sandbox EMBED_URL is NemoClaw's
token-checked Ollama proxy, so OLLAMA_PROXY_TOKEN goes in the Authorization header.
"""
import httpx

from app.core import config

PREFIX = {"query": "query: ", "passage": "passage: "}
BATCH = 32


def embed(texts, kind="query") -> list[list[float]]:
    if kind not in PREFIX:
        raise ValueError(f"kind must be 'query' or 'passage', not {kind!r}")
    headers = {"Authorization": f"Bearer {config.OLLAMA_PROXY_TOKEN}"} if config.OLLAMA_PROXY_TOKEN else {}
    out = []
    for i in range(0, len(texts), BATCH):
        batch = [PREFIX[kind] + t for t in texts[i:i + BATCH]]
        r = httpx.post(config.EMBED_URL, json={"model": config.EMBED_MODEL, "input": batch},
                       headers=headers, timeout=300)
        r.raise_for_status()
        out.extend(r.json()["embeddings"])
    return out
