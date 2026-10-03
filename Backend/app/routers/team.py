"""Team meetings (P3): POST /api/team/summarize, GET /api/team/meetings, GET /api/team/meetings/{id}.

STUB from the skeleton. P3 implements it: store meetings via app/team and call agents.meeting_agent.summarize.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/team", tags=["team"])
