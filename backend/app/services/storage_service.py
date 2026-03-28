"""MinIO / S3 storage abstraction."""
import io
from app.config import settings


class StorageService:
    def __init__(self):
        from minio import Minio
        self._client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
        self._bucket_map = {
            "recordings": settings.bucket_recordings,
            "screenshots": settings.bucket_screenshots,
            "videos": settings.bucket_videos,
            "audio": settings.bucket_audio,
            "exports": settings.bucket_exports,
            "voice-samples": settings.bucket_voice_samples,
        }

    def _bucket(self, name: str) -> str:
        return self._bucket_map.get(name, name)

    async def upload_bytes(
        self,
        bucket: str,
        object_key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload bytes to MinIO. Returns the object key."""
        import asyncio
        bucket_name = self._bucket(bucket)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.put_object(
                bucket_name=bucket_name,
                object_name=object_key,
                data=io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            ),
        )
        return object_key

    async def upload_file(
        self,
        bucket: str,
        object_key: str,
        file_path: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a file from disk to MinIO. Returns the object key."""
        import asyncio
        import os
        bucket_name = self._bucket(bucket)
        file_size = os.path.getsize(file_path)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.fput_object(
                bucket_name=bucket_name,
                object_name=object_key,
                file_path=file_path,
                content_type=content_type,
            ),
        )
        return object_key

    async def download_bytes(self, bucket: str, object_key: str) -> bytes:
        """Download an object from MinIO as bytes."""
        import asyncio
        bucket_name = self._bucket(bucket)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._client.get_object(bucket_name, object_key),
        )
        return response.read()

    async def presign_url(
        self, bucket: str, object_key: str, expires: int = 3600
    ) -> str:
        """Generate a pre-signed URL valid for `expires` seconds."""
        import asyncio
        from datetime import timedelta
        bucket_name = self._bucket(bucket)
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            None,
            lambda: self._client.presigned_get_object(
                bucket_name=bucket_name,
                object_name=object_key,
                expires=timedelta(seconds=expires),
            ),
        )
        return url

    async def delete(self, bucket: str, object_key: str):
        import asyncio
        bucket_name = self._bucket(bucket)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.remove_object(bucket_name, object_key),
        )
