from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.analytics.data import load_events, public
from app.core import events

router = APIRouter(prefix="/feedback", tags=["feedback"])


class ExperienceFeedback(BaseModel):
    employee_id: str
    rating: int = Field(ge=1, le=5)
    understood: list[str] = []
    confusing: list[str] = []
    comment: str = ""


@router.post("/experience")
def experience(fb: ExperienceFeedback):
    understood = [s.strip() for s in fb.understood if s.strip()]
    confusing = [s.strip() for s in fb.confusing if s.strip()]
    events.log_event(
        "experience_feedback", fb.employee_id, topic=None, path=None, score=fb.rating / 5,
        details={"rating": fb.rating, "understood": understood, "confusing": confusing,
                 "comment": fb.comment.strip()},
    )
    return {"ok": True}


@router.get("/experience")
def history(employee_id: str):
    return [public(e) for e in load_events()
            if e["type"] == "experience_feedback" and e.get("employee_id") == employee_id][::-1]
