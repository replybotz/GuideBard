"""Celery task: synthesize voiceover audio from video script."""
import asyncio
import uuid
from app.workers.celery_app import celery_app


@celery_app.task(name="generate_voice", bind=True, max_retries=2, time_limit=600)
def generate_voice_task(self, video_id: str, tenant_id: str, job_id: str):
    asyncio.run(_generate_voice_async(video_id, tenant_id, job_id))


async def _generate_voice_async(video_id, tenant_id, job_id):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.services.storage_service import StorageService
    from app.services.voice.voice_clone_service import synthesize_speech

    engine = create_engine(settings.database_url_sync)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": tenant_id})

        from app.models.ai_job import AIJob
        from app.models.video import Video
        from app.models.voice_profile import VoiceProfile
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
            video = db.get(Video, uuid.UUID(video_id))
            if not video or not video.script_text:
                raise ValueError("Video or script not found")

            if not video.voice_profile_id:
                raise ValueError("No voice profile selected")

            profile = db.get(VoiceProfile, video.voice_profile_id)
            if not profile:
                raise ValueError("Voice profile not found")

            job.progress = 20
            db.commit()
            _notify("running", 20)

            # Synthesize audio
            audio_bytes = await synthesize_speech(video.script_text, profile, tenant_id, db)

            job.progress = 80
            db.commit()
            _notify("running", 80)

            # Upload to MinIO
            storage = StorageService()
            audio_key = f"audio/{video_id}/narration.mp3"
            await storage.upload_bytes("audio", audio_key, audio_bytes, "audio/mpeg")

            # Update video
            video.audio_path = audio_key
            job.status = "completed"
            job.progress = 100
            job.completed_at = datetime.now(timezone.utc)
            job.result_data = {"audio_path": audio_key, "audio_size": len(audio_bytes)}
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
