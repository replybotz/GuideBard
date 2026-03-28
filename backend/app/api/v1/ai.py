"""AI generation endpoints: generate script, generate guide, job status."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.ai_job import AIJob
from app.models.api_key import ApiKey

router = APIRouter(prefix="/ai", tags=["ai"])


class GenerateScriptRequest(BaseModel):
    recording_id: str
    video_id: str
    provider: str
    model: str | None = None
    prompt_hint: str | None = None


class GenerateGuideRequest(BaseModel):
    recording_id: str
    provider: str
    model: str | None = None
    project_id: str | None = None


class TestProviderRequest(BaseModel):
    provider: str


def _job_resp(j: AIJob) -> dict:
    return {
        "id": str(j.id),
        "job_type": j.job_type,
        "status": j.status,
        "entity_type": j.entity_type,
        "entity_id": str(j.entity_id) if j.entity_id else None,
        "progress": j.progress,
        "ai_provider": j.ai_provider,
        "model_name": j.model_name,
        "tokens_used": j.tokens_used,
        "error_message": j.error_message,
        "result_data": j.result_data,
        "created_at": j.created_at.isoformat(),
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    }


@router.post("/generate-script")
async def generate_script(
    body: GenerateScriptRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.workers.tasks.generate_script import generate_script_task

    _, tenant = auth

    job = AIJob(
        tenant_id=tenant.id,
        job_type="generate_script",
        entity_type="video",
        entity_id=uuid.UUID(body.video_id),
        ai_provider=body.provider,
        model_name=body.model,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = generate_script_task.delay(
        body.recording_id,
        body.video_id,
        str(tenant.id),
        str(job.id),
        body.provider,
        body.model,
        body.prompt_hint,
    )
    job.celery_task_id = task.id
    await db.commit()

    return {"job_id": str(job.id)}


@router.post("/generate-guide")
async def generate_guide(
    body: GenerateGuideRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.workers.tasks.generate_guide import generate_guide_task

    _, tenant = auth

    job = AIJob(
        tenant_id=tenant.id,
        job_type="generate_guide",
        entity_type="guide",
        ai_provider=body.provider,
        model_name=body.model,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = generate_guide_task.delay(
        body.recording_id,
        str(tenant.id),
        str(job.id),
        body.provider,
        body.model,
        body.project_id,
    )
    job.celery_task_id = task.id
    await db.commit()

    return {"job_id": str(job.id)}


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    job = await db.get(AIJob, job_id)
    if not job or job.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_resp(job)


@router.get("/jobs")
async def list_jobs(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(AIJob).where(AIJob.tenant_id == tenant.id).order_by(AIJob.created_at.desc()).limit(50)
    )
    return [_job_resp(j) for j in result.scalars().all()]


@router.get("/providers")
async def list_providers(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.services.ai.provider_factory import PROVIDER_MODELS
    _, tenant = auth
    result = await db.execute(
        select(ApiKey).where(ApiKey.tenant_id == tenant.id, ApiKey.is_active == True)
    )
    configured = {k.provider for k in result.scalars().all()}

    return [
        {
            "provider": p,
            "is_configured": p in configured,
            "models": models,
        }
        for p, models in PROVIDER_MODELS.items()
    ]


@router.post("/test-provider")
async def test_provider(
    body: TestProviderRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    from app.services.ai.provider_factory import AIProviderFactory
    _, tenant = auth
    factory = AIProviderFactory()
    try:
        provider = await factory.get_provider(body.provider, db, tenant.id)
        ok = await provider.test_connection()
        return {"provider": body.provider, "ok": ok}
    except Exception as e:
        return {"provider": body.provider, "ok": False, "error": str(e)}
