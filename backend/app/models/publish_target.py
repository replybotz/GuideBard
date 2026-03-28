import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class PublishTarget(Base):
    __tablename__ = "publish_targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)     # youtube|wordpress
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    credentials: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # encrypted platform credentials
    settings_: Mapped[dict | None] = mapped_column("settings", JSONB, nullable=True)  # default title format, category, tags
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    publish_jobs: Mapped[list["PublishJob"]] = relationship("PublishJob", back_populates="target", cascade="all, delete-orphan")
