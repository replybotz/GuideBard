"""OpenAI provider (GPT-4o, GPT-4o-mini, o1-mini)."""
from typing import AsyncGenerator
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.services.ai.base_provider import BaseAIProvider, AIResponse


class OpenAIProvider(BaseAIProvider):
    provider_name = "openai"
    supported_models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"]

    def __init__(self, api_key: str, base_url: str | None = None):
        import openai
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=30))
    async def generate_text(self, prompt, system_prompt=None, model=None, max_tokens=4096, temperature=0.7, images=None):
        import openai
        model = model or self.default_model()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        if images:
            content = [{"type": "text", "text": prompt}]
            for img_b64 in images:
                content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}})
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": prompt})

        try:
            resp = await self._client.chat.completions.create(
                model=model, messages=messages, max_tokens=max_tokens, temperature=temperature,
            )
            return AIResponse(
                text=resp.choices[0].message.content,
                tokens_used=resp.usage.total_tokens if resp.usage else 0,
                model=model,
                provider=self.provider_name,
            )
        except openai.RateLimitError:
            raise
        except openai.APIError as e:
            raise RuntimeError(f"OpenAI API error: {e}")

    async def generate_text_stream(self, prompt, system_prompt=None, model=None, max_tokens=4096):
        model = model or self.default_model()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async def _gen() -> AsyncGenerator[str, None]:
            async with self._client.chat.completions.stream(
                model=model, messages=messages, max_tokens=max_tokens,
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        return _gen()

    async def test_connection(self) -> bool:
        try:
            await self._client.models.list()
            return True
        except Exception:
            return False
