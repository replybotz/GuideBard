"""Guide and guide step CRUD + export."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.guide import Guide
from app.models.guide_step import GuideStep
from app.models.screenshot import Screenshot

router = APIRouter(prefix="/guides", tags=["guides"])


class GuideCreate(BaseModel):
    title: str
    description: str | None = None
    project_id: str | None = None
    recording_id: str | None = None


class GuideUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


class StepCreate(BaseModel):
    title: str | None = None
    content: str | None = None
    screenshot_id: str | None = None


class StepUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    screenshot_id: str | None = None
    annotations: list | None = None


class StepReorder(BaseModel):
    order: list[str]  # list of step IDs in desired order


def _guide_resp(g: Guide) -> dict:
    return {
        "id": str(g.id),
        "project_id": str(g.project_id) if g.project_id else None,
        "recording_id": str(g.recording_id) if g.recording_id else None,
        "title": g.title,
        "description": g.description,
        "ai_provider": g.ai_provider,
        "status": g.status,
        "step_count": len(g.steps) if g.steps else 0,
        "created_at": g.created_at.isoformat(),
        "updated_at": g.updated_at.isoformat(),
        "published_at": g.published_at.isoformat() if g.published_at else None,
    }


def _step_resp(s: GuideStep) -> dict:
    return {
        "id": str(s.id),
        "guide_id": str(s.guide_id),
        "sequence_order": s.sequence_order,
        "title": s.title,
        "content": s.content,
        "screenshot_id": str(s.screenshot_id) if s.screenshot_id else None,
        "annotations": s.annotations or [],
        "updated_at": s.updated_at.isoformat(),
    }


@router.get("")
async def list_guides(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(Guide).where(Guide.tenant_id == tenant.id).order_by(Guide.created_at.desc())
    )
    return [_guide_resp(g) for g in result.scalars().all()]


@router.post("", status_code=201)
async def create_guide(
    body: GuideCreate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    guide = Guide(
        tenant_id=tenant.id,
        title=body.title,
        description=body.description,
        project_id=uuid.UUID(body.project_id) if body.project_id else None,
        recording_id=uuid.UUID(body.recording_id) if body.recording_id else None,
    )
    db.add(guide)
    await db.commit()
    await db.refresh(guide)
    return _guide_resp(guide)


@router.get("/{guide_id}")
async def get_guide(
    guide_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    guide = await db.get(Guide, guide_id)
    if not guide or guide.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Guide not found")

    result = await db.execute(
        select(GuideStep).where(GuideStep.guide_id == guide_id).order_by(GuideStep.sequence_order)
    )
    steps = result.scalars().all()

    return {
        **_guide_resp(guide),
        "steps": [_step_resp(s) for s in steps],
    }


@router.put("/{guide_id}")
async def update_guide(
    guide_id: uuid.UUID,
    body: GuideUpdate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from datetime import datetime, timezone
    _, tenant = auth
    guide = await db.get(Guide, guide_id)
    if not guide or guide.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Guide not found")

    if body.title is not None:
        guide.title = body.title
    if body.description is not None:
        guide.description = body.description
    if body.status is not None:
        guide.status = body.status
        if body.status == "published" and not guide.published_at:
            guide.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(guide)
    return _guide_resp(guide)


@router.delete("/{guide_id}", status_code=204)
async def delete_guide(
    guide_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    guide = await db.get(Guide, guide_id)
    if not guide or guide.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Guide not found")
    await db.delete(guide)
    await db.commit()


# ── Steps ─────────────────────────────────────────────────────────────────


@router.post("/{guide_id}/steps", status_code=201)
async def add_step(
    guide_id: uuid.UUID,
    body: StepCreate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    guide = await db.get(Guide, guide_id)
    if not guide or guide.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Guide not found")

    result = await db.execute(
        select(GuideStep).where(GuideStep.guide_id == guide_id).order_by(GuideStep.sequence_order.desc()).limit(1)
    )
    last = result.scalar_one_or_none()
    next_order = (last.sequence_order + 1) if last else 0

    step = GuideStep(
        tenant_id=tenant.id,
        guide_id=guide_id,
        sequence_order=next_order,
        title=body.title,
        content=body.content,
        screenshot_id=uuid.UUID(body.screenshot_id) if body.screenshot_id else None,
    )
    db.add(step)
    await db.commit()
    await db.refresh(step)
    return _step_resp(step)


@router.put("/{guide_id}/steps/{step_id}")
async def update_step(
    guide_id: uuid.UUID,
    step_id: uuid.UUID,
    body: StepUpdate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    step = await db.get(GuideStep, step_id)
    if not step or step.tenant_id != tenant.id or step.guide_id != guide_id:
        raise HTTPException(status_code=404, detail="Step not found")

    if body.title is not None:
        step.title = body.title
    if body.content is not None:
        step.content = body.content
    if body.screenshot_id is not None:
        step.screenshot_id = uuid.UUID(body.screenshot_id)
    if body.annotations is not None:
        step.annotations = body.annotations
    await db.commit()
    return _step_resp(step)


@router.delete("/{guide_id}/steps/{step_id}", status_code=204)
async def delete_step(
    guide_id: uuid.UUID,
    step_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    step = await db.get(GuideStep, step_id)
    if not step or step.tenant_id != tenant.id or step.guide_id != guide_id:
        raise HTTPException(status_code=404, detail="Step not found")
    await db.delete(step)
    await db.commit()


@router.patch("/{guide_id}/steps/reorder")
async def reorder_steps(
    guide_id: uuid.UUID,
    body: StepReorder,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    guide = await db.get(Guide, guide_id)
    if not guide or guide.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Guide not found")

    for i, step_id_str in enumerate(body.order):
        step = await db.get(GuideStep, uuid.UUID(step_id_str))
        if step and step.guide_id == guide_id:
            step.sequence_order = i
    await db.commit()
    return {"detail": "Reordered"}


@router.post("/{guide_id}/export/pdf")
async def export_pdf(
    guide_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.services.guide_service import generate_guide_pdf
    _, tenant = auth
    guide = await db.get(Guide, guide_id)
    if not guide or guide.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Guide not found")

    result = await db.execute(
        select(GuideStep).where(GuideStep.guide_id == guide_id).order_by(GuideStep.sequence_order)
    )
    steps = result.scalars().all()

    pdf_bytes = await generate_guide_pdf(guide, steps)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="guide-{guide.id}.pdf"'},
    )
