"""Perplexity provider (OpenAI-compatible API)."""
from app.services.ai.openai_provider import OpenAIProvider


class PerplexityProvider(OpenAIProvider):
    provider_name = "perplexity"
    supported_models = ["sonar-pro", "sonar", "sonar-reasoning"]

    def __init__(self, api_key: str):
        import openai
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.perplexity.ai",
        )
