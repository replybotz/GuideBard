"""GuideBard FastAPI application factory."""
import uuid
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine, AsyncSessionLocal
from app.api.router import v1_router


# ── WebSocket connection manager ─────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, channel: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(channel, []).append(ws)

    def disconnect(self, channel: str, ws: WebSocket):
        if channel in self._connections:
            self._connections[channel].remove(ws)

    async def broadcast(self, channel: str, data: dict):
        dead = []
        for ws in self._connections.get(channel, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[channel].remove(ws)


manager = ConnectionManager()


# ── Startup / shutdown ───────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations on startup
    from alembic.config import Config
    from alembic import command
    import threading

    def run_migrations():
        alembic_cfg = Config("/app/alembic.ini")
        command.upgrade(alembic_cfg, "head")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, run_migrations)

    # Enable RLS on all tenant tables
    await _setup_rls()

    # Bootstrap single-tenant admin user if needed
    if settings.is_single_tenant:
        await _bootstrap_single_tenant()

    yield

    await engine.dispose()


async def _setup_rls():
    """Enable PostgreSQL Row-Level Security on all tenant-scoped tables."""
    tenant_tables = [
        "users", "api_keys", "projects", "recordings", "screenshots",
        "guides", "guide_steps", "videos", "voice_profiles", "ai_jobs",
        "publish_targets", "publish_jobs", "app_settings",
    ]
    async with AsyncSessionLocal() as db:
        for table in tenant_tables:
            await db.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            await db.execute(text(f"DROP POLICY IF EXISTS tenant_isolation ON {table}"))
            await db.execute(text(f"""
                CREATE POLICY tenant_isolation ON {table}
                USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            """))
        await db.commit()


async def _bootstrap_single_tenant():
    """In single-tenant mode, create the default tenant+user if they don't exist."""
    from sqlalchemy import select
    from app.models.tenant import Tenant
    from app.models.user import User
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Tenant).limit(1))
        if result.scalar_one_or_none():
            return  # Already bootstrapped

        tenant = Tenant(slug="default", name=settings.app_name, plan="unlimited", status="active")
        db.add(tenant)
        await db.flush()

        user = User(
            tenant_id=tenant.id,
            username=settings.admin_username,
            email=settings.admin_email,
            password_hash=pwd_context.hash(settings.admin_password),
        )
        db.add(user)
        await db.commit()


# ── App factory ──────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # REST routes
    app.include_router(v1_router)

    # Health check
    @app.get("/health")
    async def health():
        return {"status": "ok", "app": settings.app_name}

    # WebSocket: job progress
    @app.websocket("/ws/jobs/{job_id}")
    async def ws_job_progress(websocket: WebSocket, job_id: str):
        channel = f"job:{job_id}"
        await manager.connect(channel, websocket)
        try:
            while True:
                await asyncio.sleep(30)  # keepalive ping
                await websocket.send_json({"type": "ping"})
        except WebSocketDisconnect:
            manager.disconnect(channel, websocket)

    # WebSocket: recording upload progress
    @app.websocket("/ws/recording/{recording_id}")
    async def ws_recording_progress(websocket: WebSocket, recording_id: str):
        channel = f"recording:{recording_id}"
        await manager.connect(channel, websocket)
        try:
            while True:
                await asyncio.sleep(30)
                await websocket.send_json({"type": "ping"})
        except WebSocketDisconnect:
            manager.disconnect(channel, websocket)

    return app


app = create_app()
