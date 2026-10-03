"""JSON files under DATA_DIR (see CONTRACTS.md › Shared Python helpers).

read_json("projects.json", []) / write_json("memory/emp_demo.json", {...}). Writes are atomic (temp file +
rename) and serialized, so a crash or two concurrent requests can't leave half-written JSON.
"""
import json
import os
import threading

from app.core.config import data_dir

_lock = threading.Lock()


def path_of(name: str):
    return data_dir() / name


def read_json(name: str, default):
    try:
        with open(path_of(name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(name: str, obj) -> None:
    p = path_of(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    with _lock:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        os.replace(tmp, p)
