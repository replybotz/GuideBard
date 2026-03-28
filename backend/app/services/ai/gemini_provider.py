"""Google Gemini provider."""
from typing import AsyncGenerator
from tenacity import retry, stop_after_attempt, wait_exponential
from app.services.ai.base_provider import BaseAIProvider, AIResponse


class GeminiProvider(BaseAIProvider):
    provider_name = "gemini"
    supported_models = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]

    def __init__(self, api_key: str):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self._genai = genai

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=30))
    async def generate_text(self, prompt, system_prompt=None, model=None, max_tokens=4096, temperature=0.7, images=None):
        import asyncio
        model_name = model or self.default_model()
        gen_model = self._genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_prompt or "",
        )

        parts = []
        if images:
            import base64
            from PIL import Image
            import io
            for img_b64 in images:
                img_bytes = base64.b64decode(img_b64)
                img = Image.open(io.BytesIO(img_bytes))
                parts.append(img)
        parts.append(prompt)

        resp = await gen_model.generate_content_async(
            parts,
            generation_config=self._genai.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )
        return AIResponse(
            text=resp.text,
            tokens_used=getattr(resp.usage_metadata, "total_token_count", 0),
            model=model_name,
            provider=self.provider_name,
        )

    async def generate_text_stream(self, prompt, system_prompt=None, model=None, max_tokens=4096):
        model_name = model or self.default_model()
        gen_model = self._genai.GenerativeModel(model_name=model_name, system_instruction=system_prompt or "")

        async def _gen() -> AsyncGenerator[str, None]:
            async for chunk in await gen_model.generate_content_async(
                prompt,
                generation_config=self._genai.GenerationConfig(max_output_tokens=max_tokens),
                stream=True,
            ):
                if chunk.text:
                    yield chunk.text

        return _gen()

    async def test_connection(self) -> bool:
        try:
            model = self._genai.GenerativeModel(self.supported_models[-1])
            await model.generate_content_async("Hi")
            return True
        except Exception:
            return False
