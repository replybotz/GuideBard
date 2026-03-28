"""Redis pub/sub helpers for publishing job progress to WebSocket subscribers.

Celery tasks run in a separate process and cannot directly push to FastAPI
WebSockets. Instead, tasks publish to a Redis channel, and the FastAPI
process subscribes and forwards messages to connected clients.

Channel name convention: ``job:{job_id}``
"""
import json
from app.config import settings


def publish_job_progress(job_id: str, status: str, progress: int, error: str | None = None) -> None:
    """Publish a progress event synchronously (safe to call from Celery tasks)."""
    import redis

    r = redis.from_url(settings.redis_url)
    payload = json.dumps(
        {"type": "progress", "job_id": job_id, "status": status, "progress": progress, "error": error}
    )
    r.publish(f"job:{job_id}", payload)
    r.close()


async def subscribe_job_progress(job_id: str):
    """Async generator yielding raw JSON strings from a job channel.

    Yields one message at a time; raises StopAsyncIteration when the
    channel is unsubscribed or the job is terminal.
    """
    import asyncio
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"job:{job_id}")
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                await asyncio.sleep(0.1)
                continue
            if msg["type"] == "message":
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode()
                yield data
                # Stop once the job reaches a terminal state
                try:
                    parsed = json.loads(data)
                    if parsed.get("status") in ("completed", "failed"):
                        break
                except Exception:
                    pass
    finally:
        await pubsub.unsubscribe(f"job:{job_id}")
        await r.aclose()
