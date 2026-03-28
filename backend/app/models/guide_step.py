import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class GuideStep(Base):
    __tablename__ = "guide_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    guide_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("guides.id", ondelete="CASCADE"), nullable=False, index=True)
    screenshot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("screenshots.id", ondelete="SET NULL"), nullable=True)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)  # Markdown
    annotations: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # step-level annotation overrides
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    guide: Mapped["Guide"] = relationship("Guide", back_populates="steps")
    screenshot: Mapped["Screenshot | None"] = relationship("Screenshot")
