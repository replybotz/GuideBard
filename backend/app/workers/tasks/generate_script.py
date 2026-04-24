"""Celery task: generate a voiceover script for a video using AI."""
import asyncio
import base64
import uuid
from app.workers.celery_app import celery_app

SCRIPT_SYSTEM_PROMPT = """You are a professional video narrator. Generate a clear, engaging voiceover script
for a tutorial video based on the screen recording screenshots and context provided.

The script should:
- Be written to be spoken aloud (natural, conversational tone)
- Guide the viewer through each action shown on screen
- Be concise but informative
- NOT include stage directions, time codes, or formatting
- Flow naturally from start to finish as continuous narration

Return ONLY the script text, nothing else."""


@celery_app.task(name="generate_script", bind=True, max_retries=2, time_limit=300)
def generate_script_task(
    self,
    recording_id: str,
    video_id: str,
    tenant_id: str,
    job_id: str,
    provider: str,
    model: str | None = None,
    prompt_hint: str | None = None,
):
    asyncio.run(_generate_script_async(recording_id, video_id, tenant_id, job_id, provider, model, prompt_hint))


async def _generate_script_async(recording_id, video_id, tenant_id, job_id, provider, model, prompt_hint):
    from sqlalchemy import create_engine, text, select
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
        from app.models.video import Video
        from datetime import datetime, timezone

        job = db.get(AIJob, uuid.UUID(job_id))
        if not job:
            return

        from app.utils.ws_notify import publish_job_progress

        def _notify(status: str, pct: int, err: str | None = None):
            try:
                publish_job_progress(job_id, status, pct, err)
            except Exception:
                pass

        job.status = "running"
        job.progress = 10
        db.commit()
        _notify("running", 10)

        try:
            recording = db.get(Recording, uuid.UUID(recording_id))
            video = db.get(Video, uuid.UUID(video_id))
            if not recording or not video:
                raise ValueError("Recording or video not found")

            screenshots_result = db.execute(
                select(Screenshot)
                .where(Screenshot.recording_id == uuid.UUID(recording_id))
                .order_by(Screenshot.sequence_order)
                .limit(15)
            )
            screenshots = screenshots_result.scalars().all()

            storage = StorageService()
            images_b64 = []
            for s in screenshots:
                try:
                    img_bytes = await storage.download_bytes("screenshots", s.file_path)
                    images_b64.append(base64.b64encode(img_bytes).decode())
                except Exception:
                    pass

            job.progress = 30
            db.commit()
            _notify("running", 30)

            extra = f"\n\nAdditional context: {prompt_hint}" if prompt_hint else ""
            prompt = f"""Tutorial: "{recording.title or 'Screen Recording'}"
Duration: {(recording.duration_ms or 0) // 1000} seconds
Number of steps: {len(screenshots)}{extra}

Generate a voiceover narration script for this tutorial video."""

            factory = AIProviderFactory()
            ai_provider = await factory.get_provider(provider, db, tenant_id)

            response = await ai_provider.generate_text(
                prompt=prompt,
                system_prompt=SCRIPT_SYSTEM_PROMPT,
                model=model,
                max_tokens=2048,
                images=images_b64 or None,
            )

            # Save script to video
            video.script_text = response.text.strip()
            video.ai_provider = provider

            job.status = "completed"
            job.progress = 100
            job.tokens_used = response.tokens_used
            job.model_name = response.model
            job.completed_at = datetime.now(timezone.utc)
            job.result_data = {"video_id": video_id, "script_length": len(video.script_text)}
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
