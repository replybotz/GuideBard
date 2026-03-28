"""Anthropic Claude provider."""
from typing import AsyncGenerator
from tenacity import retry, stop_after_attempt, wait_exponential
from app.services.ai.base_provider import BaseAIProvider, AIResponse


class AnthropicProvider(BaseAIProvider):
    provider_name = "anthropic"
    supported_models = ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5", "claude-sonnet-4-6"]

    def __init__(self, api_key: str):
        import anthropic
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=30))
    async def generate_text(self, prompt, system_prompt=None, model=None, max_tokens=4096, temperature=0.7, images=None):
        import anthropic
        model = model or self.default_model()

        content = []
        if images:
            for img_b64 in images:
                content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
                })
        content.append({"type": "text", "text": prompt})

        kwargs = {"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": content}]}
        if system_prompt:
            kwargs["system"] = system_prompt

        try:
            resp = await self._client.messages.create(**kwargs)
            return AIResponse(
                text=resp.content[0].text,
                tokens_used=(resp.usage.input_tokens + resp.usage.output_tokens) if resp.usage else 0,
                model=model,
                provider=self.provider_name,
            )
        except anthropic.RateLimitError:
            raise
        except anthropic.APIError as e:
            raise RuntimeError(f"Anthropic API error: {e}")

    async def generate_text_stream(self, prompt, system_prompt=None, model=None, max_tokens=4096):
        model = model or self.default_model()

        async def _gen() -> AsyncGenerator[str, None]:
            kwargs = {
                "model": model, "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            }
            if system_prompt:
                kwargs["system"] = system_prompt
            async with self._client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text

        return _gen()

    async def test_connection(self) -> bool:
        try:
            await self._client.messages.create(
                model=self.supported_models[-1],
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}],
            )
            return True
        except Exception:
            return False
