import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class Screenshot(Base):
    __tablename__ = "screenshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    recording_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recordings.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # [{type:'arrow',x,y,x2,y2,color}, {type:'text',x,y,text,color}, {type:'rect',x,y,w,h,color}, {type:'blur',x,y,w,h}]
    annotations: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    auto_captured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    recording: Mapped["Recording"] = relationship("Recording", back_populates="screenshots")
