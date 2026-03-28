"""Ollama local LLM provider (OpenAI-compatible API at localhost:11434)."""
from app.services.ai.openai_provider import OpenAIProvider


class OllamaProvider(OpenAIProvider):
    provider_name = "ollama"
    supported_models = ["llama3.1", "llama3.2", "mistral", "mixtral", "codellama", "phi3", "gemma2"]

    def __init__(self, api_key: str = "ollama", base_url: str = "http://ollama:11434/v1"):
        import openai
        # Ollama doesn't require a real key but the client needs one
        self._client = openai.AsyncOpenAI(api_key=api_key or "ollama", base_url=base_url)

    async def test_connection(self) -> bool:
        try:
            models = await self._client.models.list()
            return len(models.data) > 0
        except Exception:
            return False
