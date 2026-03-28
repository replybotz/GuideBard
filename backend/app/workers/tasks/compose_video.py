"""Celery task: compose final video (recording + audio + captions) via FFmpeg."""
import asyncio
import os
import uuid
from app.workers.celery_app import celery_app


@celery_app.task(name="compose_video", bind=True, max_retries=2, time_limit=1800)
def compose_video_task(self, video_id: str, tenant_id: str, job_id: str):
    asyncio.run(_compose_video_async(video_id, tenant_id, job_id))


async def _compose_video_async(video_id, tenant_id, job_id):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.services.storage_service import StorageService
    from app.utils.ffmpeg import compose_video, get_video_info

    engine = create_engine(settings.database_url_sync)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        db.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))

        from app.models.ai_job import AIJob
        from app.models.video import Video
        from app.models.recording import Recording
        from datetime import datetime, timezone

        job = db.get(AIJob, uuid.UUID(job_id))
        if not job:
            return

        job.status = "running"
        job.progress = 5
        db.commit()

        temp_dir = f"/tmp/guidebard/video_{video_id}"
        os.makedirs(temp_dir, exist_ok=True)

        try:
            video = db.get(Video, uuid.UUID(video_id))
            if not video:
                raise ValueError("Video not found")

            recording = db.get(Recording, video.recording_id) if video.recording_id else None
            if not recording or not recording.file_path:
                raise ValueError("Source recording not found or not processed")
            if not video.audio_path:
                raise ValueError("Audio narration not yet generated")

            # Download source files
            storage = StorageService()
            recording_local = os.path.join(temp_dir, "recording.mp4")
            audio_local = os.path.join(temp_dir, "audio.mp3")
            output_local = os.path.join(temp_dir, "output.mp4")

            recording_bytes = await storage.download_bytes("recordings", recording.file_path)
            with open(recording_local, "wb") as f:
                f.write(recording_bytes)
            job.progress = 25
            db.commit()

            audio_bytes = await storage.download_bytes("audio", video.audio_path)
            with open(audio_local, "wb") as f:
                f.write(audio_bytes)
            job.progress = 40
            db.commit()

            # Run FFmpeg composition
            await compose_video(
                recording_path=recording_local,
                audio_path=audio_local,
                output_path=output_local,
                trim_start_ms=video.trim_start_ms or 0,
                trim_end_ms=video.trim_end_ms,
                captions=video.captions or [],
                width=recording.width or 1920,
                height=recording.height or 1080,
            )

            job.progress = 80
            db.commit()

            # Get output metadata
            info = await get_video_info(output_local)
            file_size = os.path.getsize(output_local)

            # Upload composed video
            output_key = f"videos/{video_id}/final.mp4"
            await storage.upload_file("videos", output_key, output_local, "video/mp4")

            # Update video record
            video.file_path = output_key
            video.file_size_bytes = file_size
            video.duration_ms = info["duration_ms"]
            video.width = info["width"]
            video.height = info["height"]
            video.status = "ready"

            job.status = "completed"
            job.progress = 100
            job.completed_at = datetime.now(timezone.utc)
            job.result_data = {"video_path": output_key, "duration_ms": info["duration_ms"]}
            db.commit()

        except Exception as e:
            from datetime import datetime, timezone
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            if 'video' in dir() and video:
                video.status = "failed"
            db.commit()
            raise
        finally:
            import shutil
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
