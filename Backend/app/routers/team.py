"""Team meetings: POST /api/team/summarize, GET /api/team/meetings, GET /api/team/meetings/{id}.

Summaries come from agents.meeting_agent; meetings are stored in data/meetings ({id}.json + {id}.md) and the
minutes are re-indexed in the background so the Ask Agent can search them.
"""
import threading

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.agents import meeting_agent
from app.core import events
from app.team import store

router = APIRouter(prefix="/team", tags=["team"])


class SummarizeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    attendees: list[str] = []
    transcript: str = Field(min_length=1, max_length=400_000)
    employee_id: str | None = None


def _reindex():
    try:
        from app.rag import index
        index.build("_meetings", store.meetings_dir(), "_meetings", "meeting")
    except Exception as e:
        print(f"[team] meeting re-index failed: {e}", flush=True)


@router.post("/summarize")
async def summarize(req: SummarizeIn):
    attendees = [a.strip() for a in req.attendees if a.strip()]
    minutes = await run_in_threadpool(meeting_agent.summarize, req.title.strip(), attendees, req.transcript)
    m = store.save(req.title.strip(), attendees, req.transcript, minutes)
    events.log_event("meeting_summary", req.employee_id or "team", topic=m["title"], path=f"meetings/{m['id']}.md",
                     details={"meeting_id": m["id"], "action_items": len(minutes["action_items"])})
    threading.Thread(target=_reindex, daemon=True).start()
    return m


@router.get("/meetings")
def meetings():
    return store.list_meetings()


@router.get("/meetings/{meeting_id}")
def meeting(meeting_id: str):
    m = store.get(meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    return m
