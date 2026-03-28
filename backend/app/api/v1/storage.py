"""Proxy endpoint for serving MinIO objects through the API.

Avoids exposing MinIO directly; validates tenant ownership before serving.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_session
from app.models.screenshot import Screenshot
from app.services.storage_service import StorageService

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/files/screenshots/{screenshot_id}.png")
async def serve_screenshot(
    screenshot_id: str,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    """Serve a screenshot image, validating tenant ownership via RLS."""
    try:
        sid = uuid.UUID(screenshot_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    row = await db.execute(select(Screenshot).where(Screenshot.id == sid))
    screenshot: Screenshot | None = row.scalars().first()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    storage = StorageService()
    try:
        data = await storage.download_bytes("screenshots", screenshot.file_path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")

    return Response(content=data, media_type="image/png")


@router.get("/files/thumbnails/{object_key:path}")
async def serve_thumbnail(
    object_key: str,
    auth=Depends(get_current_user),
):
    """Serve a recording thumbnail (JWT required; no per-row ownership check)."""
    storage = StorageService()
    try:
        data = await storage.download_bytes("recordings", object_key)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")

    content_type = "image/jpeg" if object_key.endswith(".jpg") else "image/png"
    return Response(content=data, media_type=content_type)
