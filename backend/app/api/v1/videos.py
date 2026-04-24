"""Video CRUD, script editing, voice generation, composition."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.video import Video

router = APIRouter(prefix="/videos", tags=["videos"])


class VideoCreate(BaseModel):
    title: str
    recording_id: str | None = None
    guide_id: str | None = None
    project_id: str | None = None


class VideoUpdate(BaseModel):
    title: str | None = None
    script_text: str | None = None
    trim_start_ms: int | None = None
    trim_end_ms: int | None = None
    captions: list | None = None
    voice_profile_id: str | None = None


class ComposeRequest(BaseModel):
    voice_profile_id: str | None = None


def _video_resp(v: Video) -> dict:
    return {
        "id": str(v.id),
        "project_id": str(v.project_id) if v.project_id else None,
        "recording_id": str(v.recording_id) if v.recording_id else None,
        "guide_id": str(v.guide_id) if v.guide_id else None,
        "voice_profile_id": str(v.voice_profile_id) if v.voice_profile_id else None,
        "title": v.title,
        "status": v.status,
        "script_text": v.script_text,
        "ai_provider": v.ai_provider,
        "audio_path": v.audio_path,
        "duration_ms": v.duration_ms,
        "width": v.width,
        "height": v.height,
        "trim_start_ms": v.trim_start_ms,
        "trim_end_ms": v.trim_end_ms,
        "captions": v.captions or [],
        "file_path": v.file_path,
        "created_at": v.created_at.isoformat(),
        "updated_at": v.updated_at.isoformat(),
    }


@router.get("")
async def list_videos(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(Video).where(Video.tenant_id == tenant.id).order_by(Video.created_at.desc())
    )
    return [_video_resp(v) for v in result.scalars().all()]


@router.post("", status_code=201)
async def create_video(
    body: VideoCreate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    video = Video(
        tenant_id=tenant.id,
        title=body.title,
        recording_id=uuid.UUID(body.recording_id) if body.recording_id else None,
        guide_id=uuid.UUID(body.guide_id) if body.guide_id else None,
        project_id=uuid.UUID(body.project_id) if body.project_id else None,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return _video_resp(video)


@router.get("/{video_id}")
async def get_video(
    video_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    video = await db.get(Video, video_id)
    if not video or video.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Video not found")
    return _video_resp(video)


@router.put("/{video_id}")
async def update_video(
    video_id: uuid.UUID,
    body: VideoUpdate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    video = await db.get(Video, video_id)
    if not video or video.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Video not found")

    if body.title is not None:
        video.title = body.title
    if body.script_text is not None:
        video.script_text = body.script_text
    if body.trim_start_ms is not None:
        video.trim_start_ms = body.trim_start_ms
    if body.trim_end_ms is not None:
        video.trim_end_ms = body.trim_end_ms
    if body.captions is not None:
        video.captions = body.captions
    if body.voice_profile_id is not None:
        video.voice_profile_id = uuid.UUID(body.voice_profile_id)
    await db.commit()
    return _video_resp(video)


@router.delete("/{video_id}", status_code=204)
async def delete_video(
    video_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    video = await db.get(Video, video_id)
    if not video or video.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Video not found")
    await db.delete(video)
    await db.commit()


@router.post("/{video_id}/generate-voice")
async def generate_voice(
    video_id: uuid.UUID,
    body: ComposeRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.workers.tasks.generate_voice import generate_voice_task
    from app.models.ai_job import AIJob
    _, tenant = auth
    video = await db.get(Video, video_id)
    if not video or video.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.script_text:
        raise HTTPException(status_code=400, detail="Video has no script text")

    if body.voice_profile_id:
        video.voice_profile_id = uuid.UUID(body.voice_profile_id)
        await db.commit()

    job = AIJob(
        tenant_id=tenant.id,
        job_type="generate_voice",
        entity_type="video",
        entity_id=video_id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = generate_voice_task.delay(str(video_id), str(tenant.id), str(job.id))
    job.celery_task_id = task.id
    await db.commit()

    return {"job_id": str(job.id)}


@router.post("/{video_id}/compose")
async def compose_video(
    video_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.workers.tasks.compose_video import compose_video_task
    from app.models.ai_job import AIJob
    _, tenant = auth
    video = await db.get(Video, video_id)
    if not video or video.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.audio_path:
        raise HTTPException(status_code=400, detail="Voice narration not yet generated")

    job = AIJob(
        tenant_id=tenant.id,
        job_type="compose_video",
        entity_type="video",
        entity_id=video_id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = compose_video_task.delay(str(video_id), str(tenant.id), str(job.id))
    job.celery_task_id = task.id
    await db.commit()

    return {"job_id": str(job.id)}


@router.get("/{video_id}/download")
async def download_video(
    video_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.services.storage_service import StorageService
    _, tenant = auth
    video = await db.get(Video, video_id)
    if not video or video.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.file_path:
        raise HTTPException(status_code=400, detail="Video not yet composed")

    storage = StorageService()
    url = await storage.presign_url(bucket="videos", object_key=video.file_path, expires=3600)
    return RedirectResponse(url=url)
