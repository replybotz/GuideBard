"""Abstract base class for all AI providers."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator


@dataclass
class AIResponse:
    text: str
    tokens_used: int
    model: str
    provider: str


class BaseAIProvider(ABC):
    provider_name: str
    supported_models: list[str]

    @abstractmethod
    async def generate_text(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        images: list[str] | None = None,  # base64-encoded images for vision models
    ) -> AIResponse:
        """Generate text from a prompt. Returns AIResponse."""
        ...

    @abstractmethod
    async def generate_text_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Stream generated text tokens."""
        ...

    @abstractmethod
    async def test_connection(self) -> bool:
        """Verify the API key works. Returns True if successful."""
        ...

    def default_model(self) -> str:
        return self.supported_models[0] if self.supported_models else ""
