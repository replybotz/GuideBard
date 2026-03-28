"""JWT creation and validation."""
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import HTTPException, status
from app.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: str, tenant_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.access_token_expire_seconds)
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, tenant_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.refresh_token_expire_seconds)
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
