"""Manager analytics over fake history + real events."""
import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from app.analytics.data import load_employees, load_events, load_tickets, load_topics, public

LOW_SCORE = 0.4          # a learn attempt below this counts as "low"
PASS_SCORE = 0.6         # below this the answer is "wrong" for doc-gap purposes
MASTERED = 0.7           # avg topic score to count the topic as mastered
RISK_LOW_SCORES = 3      # 3+ low scores in the last 10 attempts
RISK_INACTIVE_DAYS = 4   # no activity for 4+ days
RISK_REPEAT_QUESTIONS = 5  # same topic asked 5+ times in the last 7 days


def _topic_index():
    topics = load_topics()
    by_path = {t["path"]: t for t in topics}
    return topics, by_path


def _topic_of(e, by_path):
    if e.get("topic"):
        return e["topic"]
    t = by_path.get(e.get("path") or "")
    return t["topic"] if t else ("Other" if e.get("path") else None)


def _details(e) -> dict:
    d = e.get("details")
    return d if isinstance(d, dict) else {}


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


def _employee_stats(emp, events, tickets, by_path, now):
    learn = [e for e in events if e["type"] == "learn_attempt" and e.get("score") is not None]
    asked = [e for e in events if e["type"] == "chat_question"]
    unanswered = [e for e in events if e["type"] == "chat_unanswered"]
    feedback = [e for e in events if e["type"] == "experience_feedback"]

    topic_scores = defaultdict(list)
    for e in learn:
        topic_scores[_topic_of(e, by_path)].append(e["score"])
    topic_avg = {t: _avg(s) for t, s in topic_scores.items()}

    path = emp.get("learning_path") or sorted(topic_avg)
    mastered = [t for t in path if (topic_avg.get(t) or 0) >= MASTERED]
    started = [t for t in path if t in topic_avg]

    last_dt = events[-1]["_dt"] if events else None
    days_inactive = (now - last_dt).days if last_dt else None
    start = date.fromisoformat(emp["start_date"]) if emp.get("start_date") else None
    days_since_start = (now.date() - start).days if start else None

    recent_learn = learn[-10:]
    low = sum(1 for e in recent_learn if e["score"] < LOW_SCORE)
    week_ago = now - timedelta(days=7)
    repeat = Counter(_topic_of(e, by_path) for e in asked if e["_dt"] >= week_ago)
    repeat_topic, repeat_n = (repeat.most_common(1)[0] if repeat else (None, 0))

    flags = []
    if low >= RISK_LOW_SCORES:
        flags.append({"code": "low_scores", "label": f"{low} low scores in last {len(recent_learn)} checks"})
    if days_inactive is not None and days_inactive >= RISK_INACTIVE_DAYS:
        flags.append({"code": "inactive", "label": f"Inactive {days_inactive} days"})
    if repeat_n >= RISK_REPEAT_QUESTIONS:
        flags.append({"code": "repeat_topic", "label": f"Asked about \"{repeat_topic}\" {repeat_n}× this week"})

    t = tickets.get(emp["id"], {})
    milestones = {
        "first_ticket_assigned": t.get("first_ticket_assigned"),
        "first_pr_merged": t.get("first_pr_merged"),
        "tickets_done": sum(1 for k in t.get("tickets", []) if k["status"] == "done"),
        "tickets_total": len(t.get("tickets", [])),
    }
    learn_part = len(mastered) / len(path) if path else 0
    progress = 0.7 * learn_part + (0.1 if milestones["first_ticket_assigned"] else 0) + \
        (0.2 if milestones["first_pr_merged"] else 0)

    gaps = Counter(g for e in learn for g in _details(e).get("gap_concepts", []) or [])
    ratings = [_details(e).get("rating") for e in feedback]

    return {
        "id": emp["id"], "name": emp.get("name"), "role": emp.get("role"), "manager": emp.get("manager"),
        "manager_type": emp.get("manager_type"), "start_date": emp.get("start_date"),
        "days_since_start": days_since_start,
        "progress": round(min(progress, 1.0), 2),
        "avg_score": _avg([e["score"] for e in learn]),
        "recent_avg_score": _avg([e["score"] for e in recent_learn]),
        "learn_attempts": len(learn), "questions_asked": len(asked), "unanswered": len(unanswered),
        "topics_total": len(path), "topics_started": len(started), "topics_mastered": len(mastered),
        "last_active": last_dt.isoformat().replace("+00:00", "Z") if last_dt else None,
        "days_inactive": days_inactive,
        "at_risk": bool(flags), "flags": flags,
        "milestones": milestones,
        "avg_rating": _avg(ratings),
        "topic_scores": topic_avg,
        "top_gaps": [{"concept": c, "count": n} for c, n in gaps.most_common(5)],
        "learning_path": path,
    }


def _context():
    now = datetime.now(timezone.utc)
    employees = load_employees()
    events = load_events()
    tickets = load_tickets()
    topics, by_path = _topic_index()
    per_emp = defaultdict(list)
    for e in events:
        per_emp[e.get("employee_id")].append(e)
    return now, employees, events, tickets, topics, by_path, per_emp


def overview() -> dict:
    now, employees, events, tickets, topics, by_path, per_emp = _context()
    rows = [_employee_stats(emp, per_emp.get(emp["id"], []), tickets, by_path, now) for emp in employees]

    topic_names = [t["topic"] for t in topics]
    for r in rows:
        for t in r["topic_scores"]:
            if t and t not in topic_names:
                topic_names.append(t)
    heatmap = {
        "topics": topic_names,
        "rows": [{"employee_id": r["id"], "name": r["name"],
                  "scores": [r["topic_scores"].get(t) for t in topic_names]} for r in rows],
    }
    week_ago = now - timedelta(days=7)
    learn = [e for e in events if e["type"] == "learn_attempt" and e.get("score") is not None]
    for r in rows:
        r.pop("topic_scores")
    return {
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "team": {
            "employees": len(rows),
            "at_risk": sum(r["at_risk"] for r in rows),
            "avg_score": _avg([e["score"] for e in learn]),
            "avg_progress": _avg([r["progress"] for r in rows]),
            "questions_this_week": sum(1 for e in events if e["type"] == "chat_question" and e["_dt"] >= week_ago),
            "unanswered_this_week": sum(1 for e in events if e["type"] == "chat_unanswered" and e["_dt"] >= week_ago),
            "checks_this_week": sum(1 for e in learn if e["_dt"] >= week_ago),
            "first_pr_merged": sum(1 for r in rows if r["milestones"]["first_pr_merged"]),
            "avg_rating": _avg([r["avg_rating"] for r in rows]),
        },
        "employees": sorted(rows, key=lambda r: (not r["at_risk"], -len(r["flags"]), r["name"] or "")),
        "heatmap": heatmap,
    }


def employee(emp_id: str) -> dict | None:
    now, employees, events, tickets, topics, by_path, per_emp = _context()
    emp = next((e for e in employees if e["id"] == emp_id), None)
    evs = per_emp.get(emp_id, [])
    if emp is None:
        if not evs:
            return None
        emp = {"id": emp_id, "name": emp_id}
    stats = _employee_stats(emp, evs, tickets, by_path, now)
    stats["topics"] = [{"topic": t, "avg_score": s} for t, s in stats.pop("topic_scores").items()]
    stats["tickets"] = tickets.get(emp_id, {}).get("tickets", [])
    stats["unanswered_questions"] = [
        {"ts": e["ts"], "topic": _topic_of(e, by_path), "question": _details(e).get("question")}
        for e in evs if e["type"] == "chat_unanswered"][-10:][::-1]
    stats["feedback"] = [{"ts": e["ts"], **_details(e)} for e in evs if e["type"] == "experience_feedback"][::-1]
    stats["recent_activity"] = [public(e) for e in evs[-30:]][::-1]
    return stats


def doc_gaps(limit: int = 15) -> list[dict]:
    """Doc sections / files that cause wrong answers, unanswered questions and confusion."""
    now, employees, events, tickets, topics, by_path, per_emp = _context()
    by_section = {f'{t["path"]} › {t["section"]}': t for t in topics}
    agg = {}

    def bucket(path, section, topic=None, source_type=None):
        key = (path, section or "")
        if key not in agg:
            t = by_path.get(path, {})
            agg[key] = {"path": path, "section": section or t.get("section"), "topic": topic or t.get("topic"),
                        "source_type": source_type or t.get("source_type") or
                        ("doc" if str(path).endswith((".md", ".txt")) else "code"),
                        "attempts": 0, "wrong_answers": 0, "scores": [], "unanswered": 0, "confused_mentions": 0,
                        "employees": set(), "gap_concepts": Counter(), "sample_questions": [], "comments": []}
        return agg[key]

    for e in events:
        d = _details(e)
        if e["type"] == "learn_attempt" and e.get("path") and e.get("score") is not None:
            b = bucket(e["path"], d.get("section"), e.get("topic"), d.get("source_type"))
            b["attempts"] += 1
            b["scores"].append(e["score"])
            if e["score"] < PASS_SCORE:
                b["wrong_answers"] += 1
                b["employees"].add(e["employee_id"])
                b["gap_concepts"].update(d.get("gap_concepts") or [])
        elif e["type"] == "chat_unanswered":
            path = e.get("path") or "(no matching doc)"
            b = bucket(path, d.get("section"), _topic_of(e, by_path), d.get("source_type"))
            b["unanswered"] += 1
            b["employees"].add(e["employee_id"])
            q = d.get("question")
            if q and q not in b["sample_questions"]:
                b["sample_questions"].append(q)
        elif e["type"] == "experience_feedback":
            for c in d.get("confusing") or []:
                t = by_section.get(c)
                path, section = (t["path"], t["section"]) if t else (c.split(" › ")[0], " › ".join(c.split(" › ")[1:]))
                b = bucket(path, section)
                b["confused_mentions"] += 1
                b["employees"].add(e["employee_id"])
                if d.get("comment") and d["comment"] not in b["comments"]:
                    b["comments"].append(d["comment"])

    out = []
    for b in agg.values():
        impact = b["wrong_answers"] + 1.5 * b["unanswered"] + 2 * b["confused_mentions"]
        if impact == 0:
            continue
        wrong_rate = b["wrong_answers"] / b["attempts"] if b["attempts"] else 0
        concepts = [c for c, _ in b["gap_concepts"].most_common(3)]
        out.append({
            "path": b["path"], "section": b["section"], "topic": b["topic"], "source_type": b["source_type"],
            "impact": round(impact, 1),
            "attempts": b["attempts"], "wrong_answers": b["wrong_answers"], "wrong_rate": round(wrong_rate, 2),
            "avg_score": _avg(b["scores"]), "unanswered": b["unanswered"],
            "confused_mentions": b["confused_mentions"], "affected_employees": len(b["employees"]),
            "gap_concepts": concepts, "sample_questions": b["sample_questions"][:4], "comments": b["comments"][:3],
            "suggestion": _suggest(b, concepts),
        })
    out.sort(key=lambda x: -x["impact"])
    if out:
        top = out[0]["impact"]
        for x in out:
            x["severity"] = "high" if x["impact"] >= 0.5 * top else "medium" if x["impact"] >= 0.2 * top else "low"
    return out[:limit]


def _suggest(b, concepts) -> str:
    where = f'{b["path"]}' + (f' ({b["section"]})' if b["section"] else "")
    parts = []
    if concepts:
        parts.append(f"Explain {', '.join(concepts)} explicitly with a short example")
    if b["unanswered"]:
        parts.append(f"add answers for {b['unanswered']} questions the assistant couldn't answer"
                     + (f' (e.g. "{b["sample_questions"][0]}")' if b["sample_questions"] else ""))
    if b["confused_mentions"] and not parts:
        parts.append("rewrite the section as a step-by-step checklist")
    return f"In {where}: " + "; ".join(parts) + "." if parts else f"Review {where}."


def report() -> dict:
    from app.core import llm

    ov = overview()
    gaps = doc_gaps(limit=6)
    facts = {
        "team": ov["team"],
        "at_risk": [{"name": r["name"], "role": r["role"], "days_since_start": r["days_since_start"],
                     "flags": [f["label"] for f in r["flags"]], "recent_avg_score": r["recent_avg_score"],
                     "top_gaps": [g["concept"] for g in r["top_gaps"][:3]]}
                    for r in ov["employees"] if r["at_risk"]],
        "on_track": [{"name": r["name"], "progress": r["progress"], "first_pr_merged": r["milestones"]["first_pr_merged"]}
                     for r in ov["employees"] if not r["at_risk"]],
        "docs_to_improve": [{k: g[k] for k in ("path", "section", "wrong_rate", "unanswered", "confused_mentions",
                                                "affected_employees", "gap_concepts", "sample_questions", "comments")}
                            for g in gaps],
    }
    messages = [
        {"role": "system", "content": (
            "You write concise weekly onboarding reports for an engineering manager. Use only the facts given. "
            "Output GitHub-flavored Markdown with exactly these sections: "
            "'## Summary' (3-4 sentences with numbers), "
            "'## People who need attention' (one bullet per person: what is wrong + one concrete action for the manager), "
            "'## Documentation to fix' (one bullet per doc: file and section in backticks, what confuses people, "
            "and the exact change to make, e.g. a missing step, example or warning to add), "
            "'## Wins' (2-3 bullets). No preamble.")},
        {"role": "user", "content": json.dumps(facts, default=str)},
    ]
    source = "llm"
    try:
        markdown = llm.chat(messages, think=True).strip()
        if "##" not in markdown:
            raise ValueError("unexpected report format")
    except Exception:
        markdown, source = _fallback_report(facts), "fallback"
    return {"generated_at": ov["generated_at"], "source": source, "markdown": markdown, "facts": facts}


def _fallback_report(f) -> str:
    t = f["team"]
    lines = ["## Summary",
             f'{t["employees"]} new hires, average onboarding progress {round((t["avg_progress"] or 0) * 100)}%, '
             f'average check score {round((t["avg_score"] or 0) * 100)}%. {t["at_risk"]} need attention. '
             f'{t["questions_this_week"]} questions asked this week, {t["unanswered_this_week"]} unanswered.',
             "", "## People who need attention"]
    for p in f["at_risk"]:
        gaps = f' Gaps: {", ".join(p["top_gaps"])}.' if p["top_gaps"] else ""
        if any(fl.startswith("Inactive") for fl in p["flags"]):
            action = "check in today and agree on a small next task."
        elif any(fl.startswith("Asked about") for fl in p["flags"]):
            action = "pair for 30 minutes on the topic they keep asking about."
        else:
            action = f'pair for 30 minutes on {p["top_gaps"][0] if p["top_gaps"] else "their weakest topic"}.'
        lines.append(f'- **{p["name"]}** ({p["role"]}, day {p["days_since_start"]}): {"; ".join(p["flags"])}.{gaps} '
                     f'Action: {action}')
    lines += ["", "## Documentation to fix"]
    for g in f["docs_to_improve"]:
        lines.append(f'- `{g["path"]}` ({g["section"]}): {round(g["wrong_rate"] * 100)}% wrong answers, '
                     f'{g["unanswered"]} unanswered questions, {g["confused_mentions"]} confusion reports. '
                     f'Add a worked example covering {", ".join(g["gap_concepts"]) or "the core steps"}.')
    lines += ["", "## Wins"]
    done = [p["name"] for p in f["on_track"] if p["first_pr_merged"]]
    lines.append(f'- {len(done)} people have merged their first PR' + (f' ({", ".join(done[:4])}).' if done else "."))
    return "\n".join(lines)
