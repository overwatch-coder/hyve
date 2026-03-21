import os
import jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "hyve_fallback_secret")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

def admin_required(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency that validates JWT bearer token for admin routes."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
