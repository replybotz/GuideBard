"""Celery tasks: publish to YouTube and WordPress."""
import asyncio
import uuid
from app.workers.celery_app import celery_app


@celery_app.task(name="publish_youtube", bind=True, max_retries=2, time_limit=3600)
def publish_youtube_task(self, job_id: str, tenant_id: str):
    asyncio.run(_publish_youtube_async(job_id, tenant_id))


@celery_app.task(name="publish_wordpress", bind=True, max_retries=2, time_limit=600)
def publish_wordpress_task(self, job_id: str, tenant_id: str):
    asyncio.run(_publish_wordpress_async(job_id, tenant_id))


async def _publish_youtube_async(job_id, tenant_id):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.services.publish.youtube_publisher import upload_to_youtube
    from app.services.storage_service import StorageService

    engine = create_engine(settings.database_url_sync)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        db.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))

        from app.models.publish_job import PublishJob
        from app.models.publish_target import PublishTarget
        from app.models.video import Video
        from datetime import datetime, timezone

        job = db.get(PublishJob, uuid.UUID(job_id))
        if not job:
            return

        job.status = "running"
        db.commit()

        try:
            target = db.get(PublishTarget, job.target_id)
            video = db.get(Video, job.entity_id)

            if not target or not video or not video.file_path:
                raise ValueError("Target or video not found/ready")

            # Download video locally
            storage = StorageService()
            import os
            temp_path = f"/tmp/guidebard/yt_{job_id}.mp4"
            video_bytes = await storage.download_bytes("videos", video.file_path)
            with open(temp_path, "wb") as f:
                f.write(video_bytes)

            meta = job.metadata_ or {}
            youtube_video_id, youtube_url = await upload_to_youtube(
                target=target,
                video_path=temp_path,
                title=meta.get("title", video.title),
                description=meta.get("description", ""),
                tags=meta.get("tags", []),
                privacy_status=meta.get("visibility", "private"),
            )

            os.unlink(temp_path)

            job.status = "completed"
            job.platform_post_id = youtube_video_id
            job.platform_url = youtube_url
            job.updated_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            from datetime import datetime, timezone
            job.status = "failed"
            job.error_message = str(e)
            db.commit()
            raise


async def _publish_wordpress_async(job_id, tenant_id):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.services.publish.wordpress_publisher import publish_to_wordpress

    engine = create_engine(settings.database_url_sync)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        db.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))

        from app.models.publish_job import PublishJob
        from app.models.publish_target import PublishTarget
        from app.models.guide import Guide
        from app.models.guide_step import GuideStep
        from app.models.video import Video
        from sqlalchemy import select
        from datetime import datetime, timezone

        job = db.get(PublishJob, uuid.UUID(job_id))
        if not job:
            return

        job.status = "running"
        db.commit()

        try:
            target = db.get(PublishTarget, job.target_id)
            if not target:
                raise ValueError("Publish target not found")

            guide = None
            video = None
            if job.entity_type in ("guide", "both"):
                guide = db.get(Guide, job.entity_id)
                if guide:
                    result = db.execute(
                        select(GuideStep).where(GuideStep.guide_id == guide.id).order_by(GuideStep.sequence_order)
                    )
                    guide._steps_list = result.scalars().all()

            if job.entity_type in ("video", "both"):
                video = db.get(Video, job.entity_id)

            meta = job.metadata_ or {}
            post_id, post_url = await publish_to_wordpress(
                target=target,
                title=meta.get("title", "New Post"),
                guide=guide,
                video=video,
                post_status=meta.get("post_status", "draft"),
            )

            job.status = "completed"
            job.platform_post_id = str(post_id)
            job.platform_url = post_url
            job.updated_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            from datetime import datetime, timezone
            job.status = "failed"
            job.error_message = str(e)
            db.commit()
            raise
