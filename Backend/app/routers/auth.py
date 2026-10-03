"""POST /api/auth/login, GET /api/auth/me: sign-in for the manager and employee portals."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str
    role: str | None = None  # "manager" | "employee": the portal the user is signing in to


@router.post("/login")
def login(req: LoginIn):
    u = auth.login(req.email, req.password)
    if not u:
        raise HTTPException(401, "Invalid email or password")
    if req.role and req.role != u["role"]:
        kind, other = ("a manager", "Manager") if u["role"] == "manager" else ("an employee", "Employee")
        raise HTTPException(403, f"This is {kind} account. Use the {other} login instead.")
    return {"token": auth.make_token(u["id"]), "user": auth.public(u)}


@router.get("/me")
def me(user: dict = Depends(auth.current_user)):
    return auth.public(user)
