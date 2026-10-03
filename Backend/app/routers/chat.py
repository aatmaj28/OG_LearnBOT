"""POST /api/chat (P1): the Ask Agent, in conversation threads.

GET /api/chat/conversations?employee_id=      list of threads (newest first)
GET /api/chat/conversations/{id}?employee_id= one thread with all its messages
DELETE /api/chat/conversations/{id}?employee_id=
GET /api/chat/history?employee_id=            every turn across threads
"""
from fastapi import APIRouter, HTTPException
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
    conversation_id: str | None = None  # None starts a new conversation


@router.post("/chat")
async def chat(req: ChatRequest):
    return await run_in_threadpool(ask_agent.run, req.message, req.employee_id, req.project_id, req.think,
                                   req.conversation_id)


@router.get("/chat/conversations")
def conversations(employee_id: str):
    return chats.list_conversations(employee_id)


@router.get("/chat/conversations/{conversation_id}")
def conversation(conversation_id: str, employee_id: str):
    c = chats.get(employee_id, conversation_id)
    if not c:
        raise HTTPException(404, "Conversation not found")
    return c


@router.delete("/chat/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, employee_id: str):
    if not chats.delete(employee_id, conversation_id):
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}


@router.get("/chat/history")
def history(employee_id: str, limit: int = 200):
    return chats.history(employee_id, limit)
