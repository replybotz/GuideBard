"""ElevenLabs TTS and voice management."""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.api_key import ApiKey
from app.models.voice_profile import VoiceProfile
from app.utils.encryption import decrypt


async def _get_elevenlabs_client(tenant_id: str, db: AsyncSession):
    """Get authenticated ElevenLabs client."""
    from elevenlabs.client import AsyncElevenLabs

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.tenant_id == uuid.UUID(tenant_id),
            ApiKey.provider == "elevenlabs",
            ApiKey.is_active == True,
        )
    )
    key_row = result.scalar_one_or_none()
    if not key_row:
        raise RuntimeError("ElevenLabs API key not configured")

    raw_key = decrypt(key_row.key_encrypted)
    return AsyncElevenLabs(api_key=raw_key)


async def synthesize_text(
    text: str,
    voice_id: str,
    tenant_id: str,
    db: AsyncSession,
    stability: float = 0.5,
    similarity_boost: float = 0.75,
    style: float = 0.0,
) -> bytes:
    """Synthesize text using ElevenLabs. Returns MP3 bytes."""
    from elevenlabs import VoiceSettings

    client = await _get_elevenlabs_client(tenant_id, db)
    audio = await client.generate(
        text=text,
        voice=voice_id,
        voice_settings=VoiceSettings(
            stability=stability,
            similarity_boost=similarity_boost,
            style=style,
        ),
        model="eleven_multilingual_v2",
    )
    # audio is an async generator of bytes
    chunks = []
    async for chunk in audio:
        chunks.append(chunk)
    return b"".join(chunks)


async def get_available_voices(tenant_id: str, db: AsyncSession) -> list[dict]:
    """Return list of voices available in the ElevenLabs account."""
    client = await _get_elevenlabs_client(tenant_id, db)
    resp = await client.voices.get_all()
    return [
        {
            "voice_id": v.voice_id,
            "name": v.name,
            "category": getattr(v, "category", "premade"),
            "preview_url": getattr(v, "preview_url", None),
        }
        for v in resp.voices
    ]
