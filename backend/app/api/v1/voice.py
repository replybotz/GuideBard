"""Voice profiles, cloning, and synthesis endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.voice_profile import VoiceProfile

router = APIRouter(prefix="/voice", tags=["voice"])


class VoiceProfileCreate(BaseModel):
    name: str
    provider: str  # elevenlabs|openai
    voice_id: str | None = None
    stability: float = 0.5
    similarity_boost: float = 0.75
    style: float = 0.0


class VoiceProfileUpdate(BaseModel):
    name: str | None = None
    stability: float | None = None
    similarity_boost: float | None = None
    style: float | None = None


class SynthesizeRequest(BaseModel):
    text: str
    voice_profile_id: str


def _profile_resp(p: VoiceProfile) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "provider": p.provider,
        "voice_id": p.voice_id,
        "is_cloned": p.is_cloned,
        "stability": p.stability,
        "similarity_boost": p.similarity_boost,
        "style": p.style,
        "preview_audio_path": p.preview_audio_path,
        "created_at": p.created_at.isoformat(),
    }


@router.get("/profiles")
async def list_profiles(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.tenant_id == tenant.id).order_by(VoiceProfile.created_at)
    )
    return [_profile_resp(p) for p in result.scalars().all()]


@router.post("/profiles", status_code=201)
async def create_profile(
    body: VoiceProfileCreate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    profile = VoiceProfile(
        tenant_id=tenant.id,
        name=body.name,
        provider=body.provider,
        voice_id=body.voice_id,
        stability=body.stability,
        similarity_boost=body.similarity_boost,
        style=body.style,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _profile_resp(profile)


@router.put("/profiles/{profile_id}")
async def update_profile(
    profile_id: uuid.UUID,
    body: VoiceProfileUpdate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    profile = await db.get(VoiceProfile, profile_id)
    if not profile or profile.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    if body.name is not None:
        profile.name = body.name
    if body.stability is not None:
        profile.stability = body.stability
    if body.similarity_boost is not None:
        profile.similarity_boost = body.similarity_boost
    if body.style is not None:
        profile.style = body.style
    await db.commit()
    return _profile_resp(profile)


@router.delete("/profiles/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    profile = await db.get(VoiceProfile, profile_id)
    if not profile or profile.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    await db.delete(profile)
    await db.commit()


@router.post("/clone", status_code=201)
async def clone_voice(
    name: str = Form(...),
    sample: UploadFile = File(...),
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    """Upload a voice sample and clone it via ElevenLabs."""
    from app.services.voice.voice_clone_service import clone_voice_elevenlabs
    from app.services.storage_service import StorageService

    _, tenant = auth

    content = await sample.read()

    # Save sample to MinIO
    storage = StorageService()
    sample_key = f"voice-samples/{tenant.id}/{uuid.uuid4()}.mp3"
    await storage.upload_bytes(
        bucket="voice-samples",
        object_key=sample_key,
        data=content,
        content_type="audio/mpeg",
    )

    # Call ElevenLabs clone API
    voice_id = await clone_voice_elevenlabs(name, content, str(tenant.id), db)

    profile = VoiceProfile(
        tenant_id=tenant.id,
        name=name,
        provider="elevenlabs",
        voice_id=voice_id,
        is_cloned=True,
        sample_file_path=sample_key,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _profile_resp(profile)


@router.post("/synthesize")
async def synthesize(
    body: SynthesizeRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    """Synthesize speech and return audio bytes (mp3)."""
    from app.services.voice.voice_clone_service import synthesize_speech

    _, tenant = auth
    profile = await db.get(VoiceProfile, uuid.UUID(body.voice_profile_id))
    if not profile or profile.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    audio_bytes = await synthesize_speech(body.text, profile, str(tenant.id), db)
    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.post("/preview")
async def preview_voice(
    body: SynthesizeRequest,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    """Short preview synthesis (first 200 chars)."""
    from app.services.voice.voice_clone_service import synthesize_speech

    _, tenant = auth
    profile = await db.get(VoiceProfile, uuid.UUID(body.voice_profile_id))
    if not profile or profile.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    preview_text = body.text[:200]
    audio_bytes = await synthesize_speech(preview_text, profile, str(tenant.id), db)
    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.get("/elevenlabs/voices")
async def list_elevenlabs_voices(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    """Fetch available voices from ElevenLabs account."""
    from app.services.voice.elevenlabs_tts import get_available_voices
    _, tenant = auth
    try:
        voices = await get_available_voices(str(tenant.id), db)
        return voices
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"ElevenLabs error: {str(e)}")
