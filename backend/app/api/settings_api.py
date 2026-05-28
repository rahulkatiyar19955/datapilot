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
            from google import genai
            client = genai.Client(api_key=key)
            # test key by attempting to get the first model
            models = client.models.list()
            # iterate just one to test
            try:
                next(models)
            except StopIteration:
                pass
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

class ModelsListRequest(BaseModel):
    provider: str
    key: str
    endpoint: Optional[str] = None

@router.post("/models")
async def list_provider_models(payload: ModelsListRequest):
    provider = payload.provider.lower()
    key = payload.key.strip()
    endpoint = payload.endpoint.strip() if payload.endpoint else None

    if not key and provider != "ollama":
        raise HTTPException(status_code=400, detail="Key cannot be empty")

    try:
        if provider == "openai":
            import openai
            client = openai.AsyncOpenAI(api_key=key, base_url=endpoint or None)
            models_resp = await client.models.list()
            relevant_models = [
                m.id for m in models_resp.data 
                if any(x in m.id.lower() for x in ["gpt-4", "gpt-5", "o1-", "o3-", "gpt-3.5"])
            ]
            if not relevant_models:
                relevant_models = [m.id for m in models_resp.data]
            return sorted(relevant_models)

        elif provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=key, base_url=endpoint or None)
            models_resp = await client.models.list()
            return [m.id for m in models_resp.data]

        elif provider == "google" or provider == "gemini":
            from google import genai
            client = genai.Client(api_key=key)
            models_resp = await asyncio.to_thread(client.models.list)
            model_ids = []
            for m in models_resp:
                name = m.name
                if name.startswith("models/"):
                    name = name[7:]
                if "gemini" in name.lower():
                    if "gemini-3.5-flash" in name:
                        model_ids.append(f"{name} (medium thinking)")
                        model_ids.append(f"{name} (high thinking)")
                    else:
                        model_ids.append(name)
            return sorted(list(set(model_ids)))

        elif provider == "ollama":
            import httpx
            url = endpoint or "http://host.docker.internal:11434"
            if "localhost" in url:
                url = url.replace("localhost", "host.docker.internal")
            if "127.0.0.1" in url:
                url = url.replace("127.0.0.1", "host.docker.internal")
            async with httpx.AsyncClient(timeout=5.0) as http_client:
                resp = await http_client.get(f"{url}/api/tags")
                resp.raise_for_status()
                data = resp.json()
                return sorted([m["name"] for m in data.get("models", [])])

        else:
            # Custom provider
            import openai
            client = openai.AsyncOpenAI(api_key=key, base_url=endpoint or None)
            models_resp = await client.models.list()
            return sorted([m.id for m in models_resp.data])

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

