"""Auth endpoints: login, register, refresh, logout, me, change-password."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext

from app.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.schemas.auth import (
    LoginRequest, RegisterRequest, TokenResponse,
    RefreshRequest, ChangePasswordRequest, UserResponse,
)
from app.utils.jwt import create_access_token, create_refresh_token, decode_token
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Find user by username (case-insensitive)
    result = await db.execute(
        select(User).join(Tenant).where(
            User.username == body.username,
            Tenant.status == "active",
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id), str(user.tenant_id)),
        refresh_token=create_refresh_token(str(user.id), str(user.tenant_id)),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if settings.is_single_tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled in single-tenant mode",
        )

    # Check username uniqueness (across all tenants for simplicity)
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    # Create tenant
    slug = body.username.lower().replace(" ", "-")[:50]
    # Ensure slug uniqueness
    slug_check = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if slug_check.scalar_one_or_none():
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    tenant = Tenant(
        slug=slug,
        name=body.tenant_name or body.username,
        plan="free",
        status="active",
    )
    db.add(tenant)
    await db.flush()  # get tenant.id

    # Create user
    user = User(
        tenant_id=tenant.id,
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(str(user.id), str(tenant.id)),
        refresh_token=create_refresh_token(str(user.id), str(tenant.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a refresh token")

    return TokenResponse(
        access_token=create_access_token(payload["sub"], payload["tenant_id"]),
        refresh_token=create_refresh_token(payload["sub"], payload["tenant_id"]),
    )


@router.post("/logout")
async def logout():
    # JWT is stateless; client discards tokens
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(auth=Depends(get_current_user)):
    user, _ = auth
    return UserResponse(
        id=str(user.id),
        tenant_id=str(user.tenant_id),
        username=user.username,
        email=user.email,
    )


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, _ = auth
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    # Reload user in this session to update
    db_user = await db.get(User, user.id)
    db_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"detail": "Password updated"}
