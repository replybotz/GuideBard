"""Publishing targets and jobs: YouTube, WordPress."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.publish_target import PublishTarget
from app.models.publish_job import PublishJob

router = APIRouter(prefix="/publish", tags=["publish"])


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
