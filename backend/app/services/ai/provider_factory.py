"""Factory: instantiate the correct AI provider from the DB API keys."""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.api_key import ApiKey
from app.utils.encryption import decrypt
from app.services.ai.base_provider import BaseAIProvider
from app.services.ai.openai_provider import OpenAIProvider
from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.grok_provider import GrokProvider
from app.services.ai.perplexity_provider import PerplexityProvider
from app.services.ai.openrouter_provider import OpenRouterProvider
from app.services.ai.ollama_provider import OllamaProvider

PROVIDER_MODELS = {
    "openai": OpenAIProvider.supported_models,
    "anthropic": AnthropicProvider.supported_models,
    "gemini": GeminiProvider.supported_models,
    "grok": GrokProvider.supported_models,
    "perplexity": PerplexityProvider.supported_models,
    "openrouter": OpenRouterProvider.supported_models,
    "ollama": OllamaProvider.supported_models,
}

PROVIDER_CLASSES = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "grok": GrokProvider,
    "perplexity": PerplexityProvider,
    "openrouter": OpenRouterProvider,
    "ollama": OllamaProvider,
}


class ProviderNotConfiguredError(Exception):
    def __init__(self, provider: str):
        super().__init__(f"API key not configured for provider: {provider}")
        self.provider = provider


class AIProviderFactory:
    async def get_provider(
        self,
        provider_name: str,
        db: AsyncSession,
        tenant_id: str | uuid.UUID,
    ) -> BaseAIProvider:
        if provider_name not in PROVIDER_CLASSES:
            raise ValueError(f"Unknown provider: {provider_name}")

        # Ollama doesn't require a stored key — it uses a local server
        if provider_name == "ollama":
            return OllamaProvider()

        result = await db.execute(
            select(ApiKey).where(
                ApiKey.tenant_id == uuid.UUID(str(tenant_id)),
                ApiKey.provider == provider_name,
                ApiKey.is_active == True,
            )
        )
        key_row = result.scalar_one_or_none()
        if not key_row:
            raise ProviderNotConfiguredError(provider_name)

        raw_key = decrypt(key_row.key_encrypted)
        cls = PROVIDER_CLASSES[provider_name]
        return cls(api_key=raw_key)
