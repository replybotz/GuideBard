"""Celery application configuration."""
from celery import Celery
from app.config import settings

celery_app = Celery(
    "guidebard",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.tasks.process_recording",
        "app.workers.tasks.generate_script",
        "app.workers.tasks.generate_guide",
        "app.workers.tasks.generate_voice",
        "app.workers.tasks.compose_video",
        "app.workers.tasks.publish_content",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.workers.tasks.compose_video.*": {"queue": "video"},
        "app.workers.tasks.generate_*": {"queue": "ai"},
        "app.workers.tasks.process_recording.*": {"queue": "video"},
        "app.workers.tasks.publish_*": {"queue": "default"},
    },
)
