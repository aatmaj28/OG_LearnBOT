"""Turn a project's files into chunks (CONTRACTS.md Chunk shape) with paths and line numbers.

Code is split by top-level function/class (windows of ~60 lines for long ones or files without definitions);
Markdown by headings. Binaries, vendored folders, lockfiles and files over 200 KB are skipped.
"""
import os
import re

MAX_BYTES = 200_000
WINDOW = 60
CODE_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".java", ".rb", ".rs", ".c", ".h", ".cpp",
            ".cs", ".php", ".sh", ".sql", ".yml", ".yaml", ".toml", ".json", ".css", ".conf", ".ini", ".env.example"}
DOC_EXT = {".md", ".mdx", ".rst", ".txt"}
SKIP_DIRS = {".git", "node_modules", ".next", "out", "dist", "build", "__pycache__", ".venv", "venv", ".venv-app",
             "vendor", "coverage", "k6_stress_testing", "test-results"}
SKIP_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock", "composer.lock",
              "Gemfile.lock", "go.sum"}

_DEF = re.compile(r"^(?:async\s+def|def|class)\s+(\w+)|"                                   # Python
                  r"^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(\w+)|"    # JS/TS functions
                  r"^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)|"          # JS/TS classes
                  r"^(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(")        # const f = (...) =>
_HEADING = re.compile(r"^(#{1,4})\s+(.+?)\s*#*\s*$")


def kind_of(path: str):
    name = os.path.basename(path)
    if name in SKIP_FILES or name.endswith((".min.js", ".map")):
        return None
    ext = os.path.splitext(name)[1].lower()
    if ext in DOC_EXT:
        return "doc"
    if ext in CODE_EXT or name in {"Dockerfile", "Makefile"}:
        return "code"
    return None


def walk(root: str):
    """Relative paths of indexable files under root."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for f in sorted(filenames):
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if kind_of(rel) and os.path.getsize(full) <= MAX_BYTES:
                yield rel


def read_text(full_path: str):
    with open(full_path, "rb") as f:
        data = f.read()
    if b"\0" in data[:4096]:
        return None  # binary
    return data.decode("utf-8", errors="replace")


def _chunk(project_id, source_type, path, section, lines, start, end):
    text = "\n".join(lines[start:end]).strip("\n")
    return {"id": f"{project_id}:{path}:{start + 1}-{end}", "project_id": project_id, "source_type": source_type,
            "path": path, "title": os.path.basename(path), "section": section, "start_line": start + 1,
            "end_line": end, "text": text, "score": 0.0}


def chunk_code(project_id, path, text, source_type="code"):
    lines = text.splitlines()
    starts = []
    for i, line in enumerate(lines):
        m = _DEF.match(line)
        if m:
            starts.append((i, next(g for g in m.groups() if g)))
    if not starts or starts[0][0] > 0:
        starts.insert(0, (0, "(top of file)"))
    out = []
    for n, (start, name) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        for s in range(start, end, WINDOW):
            e = min(s + WINDOW, end)
            if "\n".join(lines[s:e]).strip():
                section = f"{name}()" if name != "(top of file)" else name
                out.append(_chunk(project_id, source_type, path, section, lines, s, e))
    return out


def chunk_markdown(project_id, path, text, source_type="doc"):
    lines = text.splitlines()
    out, start, trail = [], 0, []
    heads = [(i, len(m.group(1)), m.group(2)) for i, l in enumerate(lines) if (m := _HEADING.match(l))]
    bounds = [(0, "(intro)")] if not heads or heads[0][0] > 0 else []
    for i, level, title in heads:
        trail = [t for t in trail if t[0] < level] + [(level, title)]
        bounds.append((i, " › ".join(t for _, t in trail)))
    for n, (start, section) in enumerate(bounds):
        end = bounds[n + 1][0] if n + 1 < len(bounds) else len(lines)
        for s in range(start, end, WINDOW):
            e = min(s + WINDOW, end)
            if "\n".join(lines[s:e]).strip():
                out.append(_chunk(project_id, source_type, path, section, lines, s, e))
    return out


def chunk_file(project_id, path, text, source_type=None):
    kind = source_type or kind_of(path) or "code"
    if path.lower().endswith((".md", ".mdx")):
        return chunk_markdown(project_id, path, text, kind)
    return chunk_code(project_id, path, text, kind)
