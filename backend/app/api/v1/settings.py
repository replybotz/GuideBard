"""Settings endpoints: API keys (encrypted), app preferences."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.api_key import ApiKey
from app.models.app_setting import AppSetting
from app.utils.encryption import encrypt, decrypt, key_hint

router = APIRouter(prefix="/settings", tags=["settings"])

VALID_PROVIDERS = {
    "openai", "anthropic", "gemini", "grok",
    "perplexity", "openrouter", "elevenlabs", "ollama",
}


class ApiKeyUpsert(BaseModel):
    api_key: str
    # Ollama doesn't need a real key but may need a base URL
    base_url: str | None = None


class ApiKeyResponse(BaseModel):
    provider: str
    key_hint: str
    is_active: bool
    base_url: str | None = None


class AppSettingUpdate(BaseModel):
    key: str
    value: str
    value_type: str = "string"


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(ApiKey).where(ApiKey.tenant_id == tenant.id)
    )
    keys = result.scalars().all()
    return [
        ApiKeyResponse(
            provider=k.provider,
            key_hint=k.key_hint or "****",
            is_active=k.is_active,
        )
        for k in keys
    ]


@router.put("/api-keys/{provider}", response_model=ApiKeyResponse)
async def upsert_api_key(
    provider: str,
    body: ApiKeyUpsert,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    if provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    _, tenant = auth

    result = await db.execute(
        select(ApiKey).where(ApiKey.tenant_id == tenant.id, ApiKey.provider == provider)
    )
    key_row = result.scalar_one_or_none()

    encrypted = encrypt(body.api_key)
    hint = key_hint(body.api_key)

    if key_row:
        key_row.key_encrypted = encrypted
        key_row.key_hint = hint
        key_row.is_active = True
    else:
        key_row = ApiKey(
            tenant_id=tenant.id,
            provider=provider,
            key_encrypted=encrypted,
            key_hint=hint,
            is_active=True,
        )
        db.add(key_row)

    await db.commit()
    return ApiKeyResponse(provider=provider, key_hint=hint, is_active=True)


@router.delete("/api-keys/{provider}", status_code=204)
async def delete_api_key(
    provider: str,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(ApiKey).where(ApiKey.tenant_id == tenant.id, ApiKey.provider == provider)
    )
    key_row = result.scalar_one_or_none()
    if key_row:
        await db.delete(key_row)
        await db.commit()


@router.get("/app")
async def get_app_settings(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(AppSetting).where(AppSetting.tenant_id == tenant.id)
    )
    rows = result.scalars().all()
    return {r.key: r.value for r in rows}


@router.put("/app")
async def update_app_settings(
    updates: list[AppSettingUpdate],
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    for upd in updates:
        result = await db.execute(
            select(AppSetting).where(
                AppSetting.tenant_id == tenant.id,
                AppSetting.key == upd.key,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.value = upd.value
            row.value_type = upd.value_type
        else:
            db.add(AppSetting(
                tenant_id=tenant.id,
                key=upd.key,
                value=upd.value,
                value_type=upd.value_type,
            ))
    await db.commit()
    return {"detail": "Settings updated"}
