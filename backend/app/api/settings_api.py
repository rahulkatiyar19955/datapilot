from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio

router = APIRouter(prefix="/settings", tags=["settings"])

class KeyTestRequest(BaseModel):
    provider: str
    key: str
    endpoint: Optional[str] = None

@router.post("/test-key")
async def test_key(payload: KeyTestRequest):
    provider = payload.provider.lower()
    key = payload.key.strip()
    endpoint = payload.endpoint.strip() if payload.endpoint else None

    if not key and provider != "ollama":
        raise HTTPException(status_code=400, detail="Key cannot be empty")

    try:
        if provider == "openai":
            import openai
            client = openai.AsyncOpenAI(api_key=key, base_url=endpoint or None)
            await client.models.list()
        elif provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=key, base_url=endpoint or None)
            await client.models.list()
        elif provider == "google" or provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=key)
            await asyncio.to_thread(genai.list_models)
        elif provider == "ollama":
            import httpx
            # Ollama requires checking the /api/tags endpoint.
            # Handle localhost to host.docker.internal translation inside Docker container.
            url = endpoint or "http://host.docker.internal:11434"
            if "localhost" in url:
                url = url.replace("localhost", "host.docker.internal")
            if "127.0.0.1" in url:
                url = url.replace("127.0.0.1", "host.docker.internal")
                
            async with httpx.AsyncClient(timeout=5.0) as http_client:
                resp = await http_client.get(f"{url}/api/tags")
                resp.raise_for_status()
        else:
            # Custom provider
            import openai
            client = openai.AsyncOpenAI(api_key=key, base_url=endpoint or None)
            await client.models.list()

        return {"status": "success", "message": "Connection verified"}
    except Exception as e:
        # Return a clean message
        raise HTTPException(status_code=400, detail=str(e))
