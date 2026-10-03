"""POST /api/chat (P1): the Ask Agent."""
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.agents import ask_agent
from app.core import chats

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    employee_id: str
    project_id: str | None = None
    think: bool = False


@router.post("/chat")
async def chat(req: ChatRequest):
    return await run_in_threadpool(ask_agent.run, req.message, req.employee_id, req.project_id, req.think)


@router.get("/chat/history")
def history(employee_id: str, limit: int = 200):
    """Every question and answer of this employee, oldest first."""
    return chats.history(employee_id, limit)
