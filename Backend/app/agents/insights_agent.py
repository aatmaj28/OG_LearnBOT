"""Insights Agent: turns the analytics dict (from app.analytics) into a manager report.

    report(analytics:dict)
      -> {summary, at_risk:[{employee_id,reason}], doc_fixes:[{path,section,problem,suggestion}], actions:[str]}

SKELETON: returns a realistic sample report. The chat_json version lands on AJ.
"""


def report(analytics: dict) -> dict:
    return {
        "summary": "Most of the cohort is on track. Two engineers are stuck on retrieval: their learn scores on "
                   "\"Vector search\" are below 50% and their chat questions about it often go unanswered.",
        "at_risk": [
            {"employee_id": "emp_004", "reason": "Average learn score 41% over the last 5 attempts; inactive 6 days."},
            {"employee_id": "emp_009", "reason": "Asked about embeddings prefixes 7 times; 4 questions unanswered."},
        ],
        "doc_fixes": [
            {"path": "README.md", "section": "Local development › SSH tunnel",
             "problem": "Doesn't say which local port maps to which GB10 service.",
             "suggestion": "Add a table: 21434 → Ollama, 8100 → voice, 18000 → the GB10 page."},
            {"path": "Backend/app/rag/search.py", "section": "search()",
             "problem": "No docstring explaining the project_ids scope.",
             "suggestion": "Document that project_ids=None searches every indexed project."},
        ],
        "actions": [
            "Pair emp_004 with a senior engineer for a 30-minute walkthrough of rag/search.py.",
            "Fix the README tunnel section; it's the top source of unanswered questions this week.",
        ],
    }
