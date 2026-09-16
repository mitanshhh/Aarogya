from abc import ABC, abstractmethod
import google.generativeai as genai
from app.core.config import settings

class AIProvider(ABC):
    @abstractmethod
    def generate_content(self, prompt: str) -> str:
        pass

class GeminiProvider(AIProvider):
    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not set")
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-1.5-flash")
        
    def generate_content(self, prompt: str) -> str:
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error generating content from Gemini: {str(e)}"

class LlamaProvider(AIProvider):
    # Stub for future local LLaMA integration via ollama or similar
    def generate_content(self, prompt: str) -> str:
        return "LLaMA integration coming soon... This is a mock response."

def get_ai_provider(provider_type: str = "gemini") -> AIProvider:
    if provider_type == "gemini":
        try:
            return GeminiProvider()
        except ValueError:
            return LlamaProvider() # Fallback
    elif provider_type == "llama":
        return LlamaProvider()
    return LlamaProvider()
