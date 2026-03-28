"""Voice cloning and synthesis dispatcher."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.voice_profile import VoiceProfile


async def clone_voice_elevenlabs(
    name: str,
    audio_bytes: bytes,
    tenant_id: str,
    db: AsyncSession,
) -> str:
    """Clone a voice on ElevenLabs using an audio sample. Returns the new voice_id."""
    from app.services.voice.elevenlabs_tts import _get_elevenlabs_client

    client = await _get_elevenlabs_client(tenant_id, db)

    # ElevenLabs voice cloning via instant voice clone
    resp = await client.voices.ivc.create(
        name=name,
        files=[("sample.mp3", audio_bytes, "audio/mpeg")],
        description=f"Cloned voice: {name}",
    )
    return resp.voice_id


async def synthesize_speech(
    text: str,
    profile: VoiceProfile,
    tenant_id: str,
    db: AsyncSession,
) -> bytes:
    """Dispatch synthesis to the correct TTS provider based on voice profile."""
    if profile.provider == "elevenlabs":
        from app.services.voice.elevenlabs_tts import synthesize_text
        return await synthesize_text(
            text=text,
            voice_id=profile.voice_id,
            tenant_id=tenant_id,
            db=db,
            stability=profile.stability,
            similarity_boost=profile.similarity_boost,
            style=profile.style,
        )
    elif profile.provider == "openai":
        from app.services.voice.openai_tts import synthesize_text
        return await synthesize_text(
            text=text,
            voice=profile.voice_id or "alloy",
            tenant_id=tenant_id,
            db=db,
        )
    else:
        raise ValueError(f"Unsupported TTS provider: {profile.provider}")
