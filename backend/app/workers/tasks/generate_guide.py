"""Celery task: generate a step-by-step guide from a recording using AI."""
import asyncio
import json
import base64
import uuid
from app.workers.celery_app import celery_app

GUIDE_SYSTEM_PROMPT = """You are an expert technical writer. Given a sequence of screenshots from a screen recording,
generate a clear, step-by-step tutorial guide.

Return your response as valid JSON with this structure:
{
  "title": "Guide title",
  "description": "Brief description of what this guide teaches",
  "steps": [
    {
      "title": "Step title",
      "content": "Step instructions in Markdown. Be clear and specific.",
      "screenshot_index": 0
    }
  ]
}

Use the screenshot_index field to reference which screenshot corresponds to each step (0-based index).
Keep instructions concise but complete. Use action verbs."""


@celery_app.task(name="generate_guide", bind=True, max_retries=2, time_limit=300)
def generate_guide_task(
    self,
    recording_id: str,
    tenant_id: str,
    job_id: str,
    provider: str,
    model: str | None = None,
    project_id: str | None = None,
):
    asyncio.run(_generate_guide_async(recording_id, tenant_id, job_id, provider, model, project_id))


async def _generate_guide_async(recording_id, tenant_id, job_id, provider, model, project_id):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.services.ai.provider_factory import AIProviderFactory
    from app.services.storage_service import StorageService

    engine = create_engine(settings.database_url_sync)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": tenant_id})

        from app.models.ai_job import AIJob
        from app.models.recording import Recording
        from app.models.screenshot import Screenshot
        from app.models.guide import Guide
        from app.models.guide_step import GuideStep
        from sqlalchemy import select
        from datetime import datetime, timezone

        job = db.get(AIJob, uuid.UUID(job_id))
        if not job:
            return

        from app.utils.ws_notify import publish_job_progress

        def _notify(status: str, pct: int, err: str | None = None):
            try:
                publish_job_progress(job_id, status, pct, err)
            except Exception:
                pass  # Never let notification failure break the task

        job.status = "running"
        job.progress = 10
        db.commit()
        _notify("running", 10)

        try:
            # Load recording and screenshots
            recording = db.get(Recording, uuid.UUID(recording_id))
            if not recording:
                raise ValueError("Recording not found")

            screenshots_result = db.execute(
                select(Screenshot)
                .where(Screenshot.recording_id == uuid.UUID(recording_id))
                .order_by(Screenshot.sequence_order)
                .limit(20)  # Cap at 20 screenshots to avoid token overload
            )
            screenshots = screenshots_result.scalars().all()

            # Fetch screenshot images for vision-capable models
            storage = StorageService()
            images_b64 = []
            for s in screenshots:
                try:
                    img_bytes = await storage.download_bytes("screenshots", s.file_path)
                    images_b64.append(base64.b64encode(img_bytes).decode())
                except Exception:
                    images_b64.append("")

            job.progress = 30
            db.commit()
            _notify("running", 30)

            # Build prompt
            prompt = f"""Recording: "{recording.title or 'Screen Recording'}"
Duration: {(recording.duration_ms or 0) // 1000} seconds
Screenshots: {len(screenshots)} captured at key moments

Please analyze these screenshots and generate a comprehensive step-by-step guide."""

            # Call AI
            factory = AIProviderFactory()
            ai_provider = await factory.get_provider(provider, db, tenant_id)
            valid_images = [img for img in images_b64 if img]

            response = await ai_provider.generate_text(
                prompt=prompt,
                system_prompt=GUIDE_SYSTEM_PROMPT,
                model=model,
                max_tokens=4096,
                images=valid_images or None,
            )

            job.progress = 70
            job.tokens_used = response.tokens_used
            job.model_name = response.model
            db.commit()
            _notify("running", 70)

            # Parse JSON response — AI may wrap it in a markdown code block
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            try:
                guide_data = json.loads(raw)
            except json.JSONDecodeError as parse_err:
                raise ValueError(
                    f"AI returned invalid JSON: {parse_err}. Response was: {raw[:500]}"
                ) from parse_err

            # Create Guide
            guide = Guide(
                tenant_id=uuid.UUID(tenant_id),
                project_id=uuid.UUID(project_id) if project_id else recording.project_id,
                recording_id=uuid.UUID(recording_id),
                title=guide_data.get("title", recording.title or "Untitled Guide"),
                description=guide_data.get("description"),
                ai_provider=provider,
                status="draft",
            )
            db.add(guide)
            db.flush()

            # Create steps
            for i, step_data in enumerate(guide_data.get("steps", [])):
                screenshot_idx = step_data.get("screenshot_index")
                screenshot_id = None
                if screenshot_idx is not None and 0 <= screenshot_idx < len(screenshots):
                    screenshot_id = screenshots[screenshot_idx].id

                step = GuideStep(
                    tenant_id=uuid.UUID(tenant_id),
                    guide_id=guide.id,
                    sequence_order=i,
                    title=step_data.get("title"),
                    content=step_data.get("content"),
                    screenshot_id=screenshot_id,
                )
                db.add(step)

            # Update job
            job.status = "completed"
            job.progress = 100
            job.completed_at = datetime.now(timezone.utc)
            job.entity_id = guide.id
            job.result_data = {"guide_id": str(guide.id)}
            db.commit()
            _notify("completed", 100)

        except Exception as e:
            from datetime import datetime, timezone
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            _notify("failed", job.progress or 0, str(e))
            raise
