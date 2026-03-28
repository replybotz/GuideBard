import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class VoiceProfile(Base):
    __tablename__ = "voice_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)   # elevenlabs|openai
    voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # provider-side voice ID
    is_cloned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sample_file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_audio_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ElevenLabs voice settings
    stability: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    similarity_boost: Mapped[float] = mapped_column(Float, nullable=False, default=0.75)
    style: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
