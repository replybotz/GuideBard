"""Recording upload and management endpoints."""
import uuid
import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.recording import Recording
from app.models.screenshot import Screenshot
from app.workers.tasks.process_recording import process_recording

router = APIRouter(prefix="/recordings", tags=["recordings"])

TEMP_BASE = "/tmp/guidebard"


class RecordingStartRequest(BaseModel):
    title: str | None = None
    project_id: str | None = None


class RecordingResponse(BaseModel):
    id: str
    title: str | None
    status: str
    duration_ms: int | None
    file_path: str | None
    thumbnail_path: str | None
    width: int | None
    height: int | None
    created_at: str


class ScreenshotAnnotationUpdate(BaseModel):
    annotations: list


@router.post("", response_model=RecordingResponse, status_code=201)
async def start_recording(
    body: RecordingStartRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    recording = Recording(
        tenant_id=tenant.id,
        title=body.title,
        project_id=uuid.UUID(body.project_id) if body.project_id else None,
        status="uploading",
    )
    db.add(recording)
    await db.commit()
    await db.refresh(recording)
    return _to_response(recording)


@router.post("/{recording_id}/chunk")
async def upload_chunk(
    recording_id: uuid.UUID,
    chunk_index: int = Form(...),
    data: UploadFile = File(...),
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    recording = await db.get(Recording, recording_id)
    if not recording or recording.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Recording not found")

    chunk_dir = os.path.join(TEMP_BASE, str(recording_id))
    os.makedirs(chunk_dir, exist_ok=True)
    chunk_path = os.path.join(chunk_dir, f"chunk_{chunk_index:06d}.webm")

    async with aiofiles.open(chunk_path, "wb") as f:
        content = await data.read()
        await f.write(content)

    recording.received_chunks = chunk_index + 1
    await db.commit()
    return {"chunk_index": chunk_index, "received": True}


@router.post("/{recording_id}/complete")
async def complete_recording(
    recording_id: uuid.UUID,
    total_chunks: int = Form(...),
    duration_ms: int = Form(...),
    width: int = Form(default=1920),
    height: int = Form(default=1080),
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    recording = await db.get(Recording, recording_id)
    if not recording or recording.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording.total_chunks = total_chunks
    recording.duration_ms = duration_ms
    recording.width = width
    recording.height = height
    recording.status = "processing"
    await db.commit()

    # Kick off background processing
    process_recording.delay(str(recording_id), str(tenant.id))

    return {"status": "processing", "recording_id": str(recording_id)}


@router.get("", response_model=list[RecordingResponse])
async def list_recordings(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(Recording).where(Recording.tenant_id == tenant.id).order_by(Recording.created_at.desc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(
    recording_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    recording = await db.get(Recording, recording_id)
    if not recording or recording.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _to_response(recording)


@router.get("/{recording_id}/screenshots")
async def list_screenshots(
    recording_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    recording = await db.get(Recording, recording_id)
    if not recording or recording.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Recording not found")

    result = await db.execute(
        select(Screenshot)
        .where(Screenshot.recording_id == recording_id)
        .order_by(Screenshot.sequence_order)
    )
    screenshots = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "sequence_order": s.sequence_order,
            "timestamp_ms": s.timestamp_ms,
            "file_path": s.file_path,
            "width": s.width,
            "height": s.height,
            "annotations": s.annotations or [],
            "auto_captured": s.auto_captured,
        }
        for s in screenshots
    ]


@router.post("/{recording_id}/screenshots", status_code=201)
async def add_screenshot(
    recording_id: uuid.UUID,
    timestamp_ms: int = Form(...),
    auto_captured: bool = Form(default=True),
    image: UploadFile = File(...),
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.services.storage_service import StorageService
    _, tenant = auth
    recording = await db.get(Recording, recording_id)
    if not recording or recording.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Get next sequence order
    result = await db.execute(
        select(Screenshot).where(Screenshot.recording_id == recording_id).order_by(Screenshot.sequence_order.desc()).limit(1)
    )
    last = result.scalar_one_or_none()
    next_order = (last.sequence_order + 1) if last else 0

    # Upload to storage
    storage = StorageService()
    content = await image.read()
    object_key = f"recordings/{recording_id}/screenshots/{next_order:04d}.png"
    await storage.upload_bytes(
        bucket="screenshots",
        object_key=object_key,
        data=content,
        content_type="image/png",
    )

    screenshot = Screenshot(
        tenant_id=tenant.id,
        recording_id=recording_id,
        sequence_order=next_order,
        timestamp_ms=timestamp_ms,
        file_path=object_key,
        auto_captured=auto_captured,
    )
    db.add(screenshot)
    await db.commit()
    await db.refresh(screenshot)
    return {"id": str(screenshot.id), "sequence_order": next_order}


@router.patch("/{recording_id}/screenshots/{screenshot_id}")
async def update_screenshot_annotations(
    recording_id: uuid.UUID,
    screenshot_id: uuid.UUID,
    body: ScreenshotAnnotationUpdate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    s = await db.get(Screenshot, screenshot_id)
    if not s or s.tenant_id != tenant.id or s.recording_id != recording_id:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    s.annotations = body.annotations
    await db.commit()
    return {"id": str(s.id), "annotations": s.annotations}


@router.delete("/{recording_id}", status_code=204)
async def delete_recording(
    recording_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    recording = await db.get(Recording, recording_id)
    if not recording or recording.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Recording not found")
    await db.delete(recording)
    await db.commit()


def _to_response(r: Recording) -> RecordingResponse:
    return RecordingResponse(
        id=str(r.id),
        title=r.title,
        status=r.status,
        duration_ms=r.duration_ms,
        file_path=r.file_path,
        thumbnail_path=r.thumbnail_path,
        width=r.width,
        height=r.height,
        created_at=r.created_at.isoformat(),
    )
