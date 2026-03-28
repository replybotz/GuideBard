"""xAI Grok provider (OpenAI-compatible API)."""
from app.services.ai.openai_provider import OpenAIProvider


class GrokProvider(OpenAIProvider):
    provider_name = "grok"
    supported_models = ["grok-3", "grok-3-mini", "grok-2"]

    def __init__(self, api_key: str):
        import openai
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.x.ai/v1",
        )
