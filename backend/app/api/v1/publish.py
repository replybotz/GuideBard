"""Publishing targets and jobs: YouTube, WordPress."""
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.config import settings as app_settings
from app.dependencies import get_current_user, get_tenant_session
from app.models.publish_target import PublishTarget
from app.models.publish_job import PublishJob
from app.utils.encryption import encrypt, decrypt

router = APIRouter(prefix="/publish", tags=["publish"])

YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


class PublishTargetCreate(BaseModel):
    platform: str  # youtube|wordpress
    name: str
    credentials: dict | None = None
    settings: dict | None = None


class YouTubePublishRequest(BaseModel):
    video_id: str
    target_id: str
    title: str
    description: str | None = None
    tags: list[str] | None = None
    visibility: str = "private"  # private|unlisted|public


class WordPressPublishRequest(BaseModel):
    target_id: str
    guide_id: str | None = None
    video_id: str | None = None
    title: str
    post_status: str = "draft"  # draft|publish


def _target_resp(t: PublishTarget) -> dict:
    return {
        "id": str(t.id),
        "platform": t.platform,
        "name": t.name,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat(),
    }


def _job_resp(j: PublishJob) -> dict:
    return {
        "id": str(j.id),
        "target_id": str(j.target_id),
        "entity_type": j.entity_type,
        "entity_id": str(j.entity_id),
        "status": j.status,
        "platform_post_id": j.platform_post_id,
        "platform_url": j.platform_url,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat(),
    }


@router.get("/targets")
async def list_targets(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(PublishTarget).where(PublishTarget.tenant_id == tenant.id)
    )
    return [_target_resp(t) for t in result.scalars().all()]


@router.post("/targets", status_code=201)
async def create_target(
    body: PublishTargetCreate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.utils.encryption import encrypt
    _, tenant = auth

    # Encrypt credentials before storing
    encrypted_creds = None
    if body.credentials:
        import json
        encrypted_creds = {"_encrypted": encrypt(json.dumps(body.credentials))}

    target = PublishTarget(
        tenant_id=tenant.id,
        platform=body.platform,
        name=body.name,
        credentials=encrypted_creds,
        settings_=body.settings,
    )
    db.add(target)
    await db.commit()
    await db.refresh(target)
    return _target_resp(target)


@router.delete("/targets/{target_id}", status_code=204)
async def delete_target(
    target_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    target = await db.get(PublishTarget, target_id)
    if not target or target.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Target not found")
    await db.delete(target)
    await db.commit()


@router.post("/targets/{target_id}/test")
async def test_target(
    target_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    target = await db.get(PublishTarget, target_id)
    if not target or target.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Target not found")

    if target.platform == "wordpress":
        from app.services.publish.wordpress_publisher import test_connection
        ok, msg = await test_connection(target)
    elif target.platform == "youtube":
        ok, msg = True, "YouTube uses OAuth; check credentials setup"
    else:
        ok, msg = False, "Unknown platform"

    return {"ok": ok, "message": msg}


@router.post("/youtube")
async def publish_youtube(
    body: YouTubePublishRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.workers.tasks.publish_content import publish_youtube_task

    _, tenant = auth
    target = await db.get(PublishTarget, uuid.UUID(body.target_id))
    if not target or target.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Target not found")

    job = PublishJob(
        tenant_id=tenant.id,
        target_id=uuid.UUID(body.target_id),
        entity_type="video",
        entity_id=uuid.UUID(body.video_id),
        metadata_={
            "title": body.title,
            "description": body.description,
            "tags": body.tags,
            "visibility": body.visibility,
        },
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = publish_youtube_task.delay(str(job.id), str(tenant.id))
    return {"job_id": str(job.id)}


@router.post("/wordpress")
async def publish_wordpress(
    body: WordPressPublishRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.workers.tasks.publish_content import publish_wordpress_task

    _, tenant = auth
    target = await db.get(PublishTarget, uuid.UUID(body.target_id))
    if not target or target.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Target not found")

    entity_id = uuid.UUID(body.guide_id or body.video_id)
    entity_type = "guide" if body.guide_id else "video"

    job = PublishJob(
        tenant_id=tenant.id,
        target_id=uuid.UUID(body.target_id),
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_={"title": body.title, "post_status": body.post_status},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = publish_wordpress_task.delay(str(job.id), str(tenant.id))
    return {"job_id": str(job.id)}


@router.get("/jobs")
async def list_publish_jobs(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(PublishJob).where(PublishJob.tenant_id == tenant.id).order_by(PublishJob.created_at.desc()).limit(50)
    )
    return [_job_resp(j) for j in result.scalars().all()]


@router.get("/jobs/{job_id}")
async def get_publish_job(
    job_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    job = await db.get(PublishJob, job_id)
    if not job or job.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_resp(job)


# ── YouTube OAuth Flow ─────────────────────────────────────────────────────


class YouTubeOAuthStartRequest(BaseModel):
    client_id: str
    client_secret: str
    channel_name: str = "My YouTube Channel"


@router.post("/youtube/oauth/start")
async def youtube_oauth_start(
    body: YouTubeOAuthStartRequest,
    auth=Depends(get_current_user),
):
    """Return the Google OAuth authorization URL for the user to visit."""
    from google_auth_oauthlib.flow import Flow  # type: ignore

    user, tenant = auth
    redirect_uri = f"{app_settings.app_url}/api/v1/publish/youtube/oauth/callback"

    # Encode state: tenant_id|user_id|encrypted(client_secret)|channel_name
    state_payload = {
        "tenant_id": str(tenant.id),
        "user_id": str(user.id),
        "client_id": body.client_id,
        "client_secret_enc": encrypt(body.client_secret),
        "channel_name": body.channel_name,
    }
    state = encrypt(json.dumps(state_payload))

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": body.client_id,
                "client_secret": body.client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=YOUTUBE_SCOPES,
    )
    flow.redirect_uri = redirect_uri
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return {"auth_url": auth_url}


@router.get("/youtube/oauth/callback")
async def youtube_oauth_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
):
    """Handle the Google OAuth redirect, exchange code for tokens, save target."""
    from google_auth_oauthlib.flow import Flow  # type: ignore
    from app.database import AsyncSessionLocal

    try:
        state_payload = json.loads(decrypt(state))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    tenant_id = state_payload["tenant_id"]
    client_id = state_payload["client_id"]
    client_secret = decrypt(state_payload["client_secret_enc"])
    channel_name = state_payload.get("channel_name", "YouTube Channel")

    redirect_uri = f"{app_settings.app_url}/api/v1/publish/youtube/oauth/callback"

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=YOUTUBE_SCOPES,
        state=state,
    )
    flow.redirect_uri = redirect_uri

    try:
        flow.fetch_token(code=code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {e}")

    creds = flow.credentials
    credentials_data = {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    from sqlalchemy import text as sa_text

    async with AsyncSessionLocal() as db:
        # Set RLS tenant context
        await db.execute(sa_text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))
        target = PublishTarget(
            tenant_id=uuid.UUID(tenant_id),
            platform="youtube",
            name=channel_name,
            credentials={"_encrypted": encrypt(json.dumps(credentials_data))},
        )
        db.add(target)
        await db.commit()

    # Redirect back to settings page with success indicator
    return HTMLResponse(
        content="""
        <html><body>
        <script>
          if (window.opener) {
            window.opener.postMessage({type:'youtube_oauth_success'}, '*');
            window.close();
          } else {
            window.location.href = '/settings?tab=publishing&youtube=connected';
          }
        </script>
        <p>YouTube connected! You can close this window.</p>
        </body></html>
        """
    )
