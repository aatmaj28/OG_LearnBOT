from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.analytics.data import load_topics
from app.learn import service

router = APIRouter(prefix="/learn", tags=["learn"])


class StartRequest(BaseModel):
    employee_id: str
    topic: str | None = None
    path: str | None = None


class AnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str


@router.get("/topics")
def topics():
    """Suggested topics (onboarding catalog) and browsable files for the Learn picker."""
    try:
        from app.rag import files as rag_files
        files = rag_files.list_files()
    except Exception:
        files = []
    return {"topics": load_topics(), "files": files}


@router.post("/start")
async def start(req: StartRequest):
    try:
        return await run_in_threadpool(service.start, req.employee_id, req.topic, req.path)
    except service.LearnError as e:
        raise HTTPException(400, str(e))


@router.post("/answer")
async def answer(req: AnswerRequest):
    try:
        return await run_in_threadpool(service.answer, req.session_id, req.question_id, req.answer)
    except service.LearnError as e:
        raise HTTPException(400, str(e))
