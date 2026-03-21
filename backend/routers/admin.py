from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import jwt
from datetime import datetime, timedelta
from core.security import admin_required, JWT_SECRET, ADMIN_PASSWORD

router = APIRouter(prefix="/admin", tags=["Admin"])

class AdminLoginRequest(BaseModel):
    password: str

@router.post("/login")
def admin_login(req: AdminLoginRequest):
    """Authenticate admin with password, returns JWT token."""
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = jwt.encode(
        {"role": "admin", "exp": datetime.utcnow() + timedelta(hours=24)},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token}

@router.get("/verify")
def admin_verify(admin=Depends(admin_required)):
    """Verify that the admin token is still valid."""
    return {"status": "valid", "role": "admin"}
