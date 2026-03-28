"""OpenRouter provider — access to 200+ models via a single OpenAI-compatible API."""
from app.services.ai.openai_provider import OpenAIProvider


class OpenRouterProvider(OpenAIProvider):
    provider_name = "openrouter"
    supported_models = [
        "openai/gpt-4o",
        "anthropic/claude-opus-4-5",
        "google/gemini-2.0-flash",
        "meta-llama/llama-3.1-70b-instruct",
        "mistralai/mistral-large",
        "deepseek/deepseek-chat",
    ]

    def __init__(self, api_key: str):
        import openai
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://guidebard.app",
                "X-Title": "GuideBard",
            },
        )
