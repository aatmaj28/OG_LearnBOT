from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.analytics import service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def overview():
    return service.overview()


@router.get("/employee/{employee_id}")
def employee(employee_id: str):
    data = service.employee(employee_id)
    if data is None:
        raise HTTPException(404, "Unknown employee")
    return data


@router.get("/doc-gaps")
def doc_gaps(limit: int = 15):
    return service.doc_gaps(limit=limit)


@router.get("/report")
async def report():
    return await run_in_threadpool(service.report)
