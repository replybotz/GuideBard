from fastapi import APIRouter
from app.api.v1 import auth, projects, recordings, guides, videos, ai, voice, publish, settings

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(auth.router)
v1_router.include_router(projects.router)
v1_router.include_router(recordings.router)
v1_router.include_router(guides.router)
v1_router.include_router(videos.router)
v1_router.include_router(ai.router)
v1_router.include_router(voice.router)
v1_router.include_router(publish.router)
v1_router.include_router(settings.router)
