"""Ask Agent: answers an employee's question about the codebase with path + line citations.

    run(message, employee_id, project_id=None, think=False)
      -> {answer, citations:[Chunk], unanswered:bool, steps:[str]}

LangGraph tool loop (llm <-> tools, at most MAX_STEPS tool rounds) over the employee's assigned projects.
Tools: search_knowledge, read_file, flag_doc_gap. The model must answer only from tool results, cite path + lines,
and call flag_doc_gap when the material doesn't cover the question. If the model is unreachable, falls back to
returning the best search hits.
"""
import json
import operator
import re
from typing import Annotated, TypedDict

from langgraph.graph import END, StateGraph

from app.core import events, llm, memory
from app.rag import files as rag_files
from app.rag import search as rag_search

MAX_STEPS = 4
SYSTEM = """You are LearnBOT, an onboarding assistant for new developers on this codebase.
Answer ONLY from what the tools return: call search_knowledge first, and read_file when you need more of a file.
Cite every claim as `path:start-end` (e.g. `Backend/app/main.py:12-30`) using the paths and line numbers from the
tool results. Keep answers short and concrete (what, where, how).
If the results don't answer the question, say clearly that the codebase/docs don't cover it and call flag_doc_gap.
Never invent files, functions, settings, variable names or line numbers: when you name one, it must appear
verbatim in a tool result (quote the exact line)."""

ANSWER_NOW = {"role": "user", "content": "Answer the question now from the tool results above, with "
               "path:start-end citations. Do not call any more tools."}

TOOL_SPECS = [
    {"type": "function", "function": {
        "name": "search_knowledge",
        "description": "Semantic search over the project's code, docs and meeting notes. Returns chunks with path, "
                       "line range and text.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "read_file",
        "description": "Read lines of a project file (path as returned by search_knowledge).",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}},
            "required": ["path"]}}},
    {"type": "function", "function": {
        "name": "flag_doc_gap",
        "description": "Record that the documentation doesn't answer this question, so a manager can fix the docs.",
        "parameters": {"type": "object", "properties": {
            "topic": {"type": "string"}, "reason": {"type": "string"}}, "required": ["topic"]}}},
]


class State(TypedDict):
    messages: Annotated[list, operator.add]
    steps: Annotated[list, operator.add]
    found: Annotated[list, operator.add]   # chunks returned by tools (citation candidates)
    gaps: Annotated[list, operator.add]
    rounds: int


def _short(c):
    return f"{c['path']}:{c['start_line']}-{c['end_line']}"


def _make_tools(project_ids):
    def search_knowledge(query):
        hits = rag_search.search(query, k=6, project_ids=project_ids)
        text = "\n\n".join(f"[{_short(c)}] ({c['source_type']}, {c['section']})\n{c['text'][:1500]}" for c in hits)
        return text or "No results.", hits

    def read_file(path, start_line=1, end_line=None):
        last = None
        for pid in (project_ids or [None]):
            try:
                f = rag_files.get_file(pid, path)
                break
            except FileNotFoundError as e:
                last = e
        else:
            return f"File not found: {path} ({last})", []
        lines = f["text"].splitlines()
        start = max(1, int(start_line or 1))
        end = min(len(lines), int(end_line or start + 79), start + 199)
        body = "\n".join(f"{n}: {lines[n - 1]}" for n in range(start, end + 1))
        chunk = {"id": f"{(project_ids or ['_'])[0]}:{path}:{start}-{end}", "project_id": (project_ids or [None])[0],
                 "source_type": "doc" if path.endswith((".md", ".txt")) else "code", "path": path,
                 "title": path.rsplit("/", 1)[-1], "section": f"lines {start}-{end}", "start_line": start,
                 "end_line": end, "text": "\n".join(lines[start - 1:end]), "score": 1.0}
        return f"[{path}:{start}-{end}]\n{body}", [chunk]

    def flag_doc_gap(topic, reason=""):
        return f"Flagged documentation gap: {topic}", []

    return {"search_knowledge": search_knowledge, "read_file": read_file, "flag_doc_gap": flag_doc_gap}


def _build(project_ids, think):
    tools = _make_tools(project_ids)

    def llm_node(state):
        # Tools stay in every request: Ollama returns an empty reply if they disappear while the history holds
        # tool results. On the last round (or after an empty reply) the model is told to answer now.
        last_round = state["rounds"] >= MAX_STEPS
        messages = state["messages"] + ([ANSWER_NOW] if last_round else [])
        msg = llm.complete(messages, tools=TOOL_SPECS, think=think)
        if not msg.tool_calls and not msg.content:
            msg = llm.complete(state["messages"] + [ANSWER_NOW], tools=TOOL_SPECS, think=think)
            last_round = True
        out = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls and not last_round:
            out["tool_calls"] = [{"id": t.id, "type": "function",
                                  "function": {"name": t.function.name, "arguments": t.function.arguments}}
                                 for t in msg.tool_calls]
        return {"messages": [out], "rounds": state["rounds"] + 1}

    def tools_node(state):
        results, steps, found, gaps = [], [], [], []
        for tc in state["messages"][-1]["tool_calls"]:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
                text, chunks = tools[name](**args) if name in tools else (f"Unknown tool {name}", [])
            except Exception as e:  # report tool errors back to the model
                args, text, chunks = {}, f"ERROR: {e}", []
            steps.append(f"{name}({', '.join(json.dumps(v) for v in args.values())})")
            found += chunks
            if name == "flag_doc_gap":
                gaps.append(args)
            results.append({"role": "tool", "tool_call_id": tc["id"], "content": text})
        return {"messages": results, "steps": steps, "found": found, "gaps": gaps}

    def route(state):
        return "tools" if state["messages"][-1].get("tool_calls") else END

    g = StateGraph(State)
    g.add_node("llm", llm_node)
    g.add_node("tools", tools_node)
    g.set_entry_point("llm")
    g.add_conditional_edges("llm", route, {"tools": "tools", END: END})
    g.add_edge("tools", "llm")
    return g.compile()


def _citations(answer, found, limit=5):
    """Chunks the answer cites (by path), else the top search hits; one per path:lines."""
    seen, out = set(), []
    cited = [c for c in found if c["path"] in answer]
    for c in (cited or sorted(found, key=lambda c: -c.get("score", 0))):
        key = _short(c)
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out[:limit]


def run(message, employee_id, project_id=None, think=False) -> dict:
    from app.routers.projects import project_ids_for  # avoid an import cycle at module load
    project_ids = [project_id] if project_id else project_ids_for(employee_id)
    messages = [{"role": "system", "content": SYSTEM}, *memory.history(employee_id),
                {"role": "user", "content": message}]
    try:
        # Always start from a search on the question itself (the model sometimes answers from general knowledge
        # without calling a tool); it can search again or read files from there.
        first_text, first_hits = _make_tools(project_ids)["search_knowledge"](message)
        seed_call = {"id": "seed_search", "type": "function",
                     "function": {"name": "search_knowledge", "arguments": json.dumps({"query": message})}}
        messages += [{"role": "assistant", "content": "", "tool_calls": [seed_call]},
                     {"role": "tool", "tool_call_id": "seed_search", "content": first_text}]
        out = _build(project_ids, think).invoke(
            {"messages": messages, "steps": [f"search_knowledge({json.dumps(message)})"], "found": first_hits,
             "gaps": [], "rounds": 1},
            {"recursion_limit": 2 * MAX_STEPS + 4})
        answer = out["messages"][-1]["content"].strip() or "I couldn't produce an answer."
        steps, found, gaps = out["steps"], out["found"], out["gaps"]
    except Exception as e:  # model unreachable: show the best matches instead of failing
        found = rag_search.search(message, k=3, project_ids=project_ids)
        answer = ("The model isn't reachable right now. These are the most relevant places in the code:\n"
                  + "\n".join(f"- `{_short(c)}` ({c['section']})" for c in found))
        steps, gaps = [f"fallback: search only ({type(e).__name__})"], []

    citations = _citations(answer, found)
    unanswered = bool(gaps) or not citations or bool(re.search(r"\b(don'?t|do not|doesn'?t) (cover|mention)", answer, re.I))
    top = citations[0] if citations else {}
    common = {"topic": (gaps[0].get("topic") if gaps else None), "path": top.get("path"),
              "project_id": top.get("project_id") or project_id}
    events.log_event("chat_question", employee_id, **common, details={"question": message})
    if unanswered:
        events.log_event("chat_unanswered", employee_id, **common,
                         details={"question": message, "reason": gaps[0].get("reason") if gaps else None})
    if citations and not answer.startswith(("I couldn't", "The model isn't")):
        memory.add_turn(employee_id, message, answer)
    return {"answer": answer, "citations": citations, "unanswered": unanswered, "steps": steps}
