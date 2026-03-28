"""OpenAI TTS (tts-1, tts-1-hd)."""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.api_key import ApiKey
from app.utils.encryption import decrypt

OPENAI_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]


async def synthesize_text(
    text: str,
    voice: str,
    tenant_id: str,
    db: AsyncSession,
    model: str = "tts-1",
) -> bytes:
    """Synthesize text using OpenAI TTS. Returns MP3 bytes."""
    import openai

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.tenant_id == uuid.UUID(tenant_id),
            ApiKey.provider == "openai",
            ApiKey.is_active == True,
        )
    )
    key_row = result.scalar_one_or_none()
    if not key_row:
        raise RuntimeError("OpenAI API key not configured")

    raw_key = decrypt(key_row.key_encrypted)
    client = openai.AsyncOpenAI(api_key=raw_key)

    response = await client.audio.speech.create(
        model=model,
        voice=voice,
        input=text,
        response_format="mp3",
    )
    return await response.aread()
