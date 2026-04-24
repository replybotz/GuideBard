"""Celery task: concatenate recording chunks, transcode, extract metadata."""
import os
import glob
import asyncio
from app.workers.celery_app import celery_app


@celery_app.task(name="process_recording", bind=True, max_retries=3)
def process_recording(self, recording_id: str, tenant_id: str):
    asyncio.run(_process_recording_async(recording_id, tenant_id))


async def _process_recording_async(recording_id: str, tenant_id: str):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session
    from app.config import settings
    from app.utils.ffmpeg import concat_chunks, transcode_to_mp4, extract_thumbnail, get_video_info
    from app.services.storage_service import StorageService

    # Use sync DB for Celery (runs in separate process)
    from sqlalchemy import create_engine as sync_engine
    from sqlalchemy.orm import sessionmaker

    engine = sync_engine(settings.database_url_sync)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": tenant_id})

        from app.models.recording import Recording
        recording = db.get(Recording, recording_id)
        if not recording:
            return

        temp_dir = f"/tmp/guidebard/{recording_id}"
        chunk_files = sorted(glob.glob(os.path.join(temp_dir, "chunk_*.webm")))

        if not chunk_files:
            recording.status = "failed"
            recording.metadata_ = {"error": "No chunks found"}
            db.commit()
            return

        concat_path = os.path.join(temp_dir, "concat.webm")
        mp4_path = os.path.join(temp_dir, "recording.mp4")
        thumbnail_path = os.path.join(temp_dir, "thumbnail.jpg")
        object_key = f"recordings/{recording_id}/video.mp4"
        thumb_key = f"recordings/{recording_id}/thumbnail.jpg"

        try:
            # Step 1: Concat chunks
            await concat_chunks(chunk_files, concat_path)

            # Step 2: Transcode to MP4
            await transcode_to_mp4(concat_path, mp4_path)

            # Step 3: Extract metadata
            info = await get_video_info(mp4_path)

            # Step 4: Thumbnail
            await extract_thumbnail(mp4_path, thumbnail_path)

            # Step 5: Upload to MinIO
            storage = StorageService()
            await storage.upload_file("recordings", object_key, mp4_path, "video/mp4")
            await storage.upload_file("recordings", thumb_key, thumbnail_path, "image/jpeg")

            # Step 6: Update recording record
            file_size = os.path.getsize(mp4_path)
            recording.status = "ready"
            recording.file_path = object_key
            recording.thumbnail_path = thumb_key
            recording.duration_ms = info["duration_ms"]
            recording.width = info["width"]
            recording.height = info["height"]
            recording.fps = info["fps"]
            recording.file_size_bytes = file_size
            recording.mime_type = "video/mp4"
            db.commit()

        except Exception as e:
            recording.status = "failed"
            recording.metadata_ = {"error": str(e)}
            db.commit()
            raise
        finally:
            # Clean up temp files
            import shutil
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
