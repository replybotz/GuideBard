"""FastAPI dependency injection: auth, tenant-scoped DB, etc."""
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.database import AsyncSessionLocal
from app.utils.jwt import decode_token
from app.models.user import User
from app.models.tenant import Tenant
from app.config import settings

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> tuple[User, Tenant]:
    """
    Validate JWT, load User + Tenant, set RLS context.
    Returns (user, tenant).
    """
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")

    if not user_id or not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    async with AsyncSessionLocal() as session:
        # Set RLS context
        await session.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": tenant_id})

        user = await session.get(User, uuid.UUID(user_id))
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

        tenant = await session.get(Tenant, uuid.UUID(tenant_id))
        if not tenant or tenant.status != "active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant suspended or not found")

        return user, tenant


async def get_tenant_session(
    auth: tuple[User, Tenant] = Depends(get_current_user),
) -> AsyncSession:
    """
    Open a DB session with tenant RLS context set.
    Yields the session; caller must NOT close it — the context manager handles it.
    """
    _, tenant = auth
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SET LOCAL app.current_tenant_id = :tid"),
            {"tid": str(tenant.id)},
        )
        yield session


class TenantDeps:
    """Bundle of commonly needed deps — avoids repeating Depends() chains."""
    def __init__(
        self,
        auth: tuple[User, Tenant] = Depends(get_current_user),
        db: AsyncSession = Depends(get_tenant_session),
    ):
        self.user, self.tenant = auth
        self.db = db
        self.tenant_id = self.tenant.id
