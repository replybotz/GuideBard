from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Deployment
    deployment_mode: Literal["single_tenant", "multi_tenant"] = "single_tenant"
    debug: bool = False

    # Security
    secret_key: str
    encryption_key: str
    access_token_expire_seconds: int = 3600
    refresh_token_expire_seconds: int = 2592000

    # Database
    database_url: str
    database_url_sync: str

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # MinIO / S3
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "guidebard-minio"
    minio_secret_key: str
    minio_use_ssl: bool = False
    minio_bucket_prefix: str = "guidebard"

    # App
    app_name: str = "GuideBard"
    app_url: str = "http://localhost"

    # Single-tenant bootstrap
    admin_username: str = "admin"
    admin_email: str = "admin@localhost"
    admin_password: str = "changeme"

    # Celery
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

    # FFmpeg
    ffmpeg_threads: int = 4

    # Optional
    sentry_dsn: str | None = None

    @property
    def is_single_tenant(self) -> bool:
        return self.deployment_mode == "single_tenant"

    @property
    def is_multi_tenant(self) -> bool:
        return self.deployment_mode == "multi_tenant"

    @property
    def bucket_recordings(self) -> str:
        return f"{self.minio_bucket_prefix}-recordings"

    @property
    def bucket_screenshots(self) -> str:
        return f"{self.minio_bucket_prefix}-screenshots"

    @property
    def bucket_videos(self) -> str:
        return f"{self.minio_bucket_prefix}-videos"

    @property
    def bucket_audio(self) -> str:
        return f"{self.minio_bucket_prefix}-audio"

    @property
    def bucket_exports(self) -> str:
        return f"{self.minio_bucket_prefix}-exports"

    @property
    def bucket_voice_samples(self) -> str:
        return f"{self.minio_bucket_prefix}-voice-samples"


settings = Settings()
