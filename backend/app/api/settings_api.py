from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import os
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_sqlite import get_db

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
            # Run synchronous SDK call off the event loop to avoid blocking.
            def _test_connection():
                models = client.models.list()
                try:
                    next(models)
                except StopIteration:
                    pass
            await asyncio.to_thread(_test_connection)
        elif provider == "nvidia":
            import openai
            client = openai.AsyncOpenAI(
                api_key=key,
                base_url="https://integrate.api.nvidia.com/v1",
            )
            await client.models.list()
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
            # Eagerly materialize the lazy pager inside the thread so no
            # synchronous network I/O escapes back to the event loop.
            models_resp = await asyncio.to_thread(lambda: list(client.models.list()))
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

        elif provider == "nvidia":
            import openai
            client = openai.AsyncOpenAI(
                api_key=key,
                base_url="https://integrate.api.nvidia.com/v1",
            )
            models_resp = await client.models.list()
            return sorted([m.id for m in models_resp.data])

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


class KeyUpdateRequest(BaseModel):
    provider: str
    key: str


@router.post("/keys")
async def update_key(payload: KeyUpdateRequest):
    from app.config import settings

    provider = payload.provider.lower()
    key = payload.key.strip()

    if provider == "openai":
        settings.openai_api_key = key or None
    elif provider == "anthropic":
        settings.anthropic_api_key = key or None
    elif provider == "google" or provider == "gemini":
        settings.gemini_api_key = key or None
    elif provider == "nvidia":
        settings.nvidia_api_key = key or None
    elif provider == "default_provider":
        settings.default_provider = key or None
    elif provider == "default_model":
        settings.default_model = key or None
        from app.llm.router import get_router
        get_router.cache_clear()

    return {"status": "success", "message": f"Updated API key for {provider}"}


# ---------------------------------------------------------------------------
# Agent model override endpoints
# ---------------------------------------------------------------------------

class AgentModelRequest(BaseModel):
    model_id: str


@router.get("/agent-models")
async def get_agent_models(db: AsyncSession = Depends(get_db)):
    from app.models import AgentModelRecord
    from sqlalchemy import select
    rows = (await db.execute(select(AgentModelRecord))).scalars().all()
    return {r.specialist: r.model_id for r in rows}


@router.put("/agent-models/{specialist}")
async def set_agent_model(specialist: str, payload: AgentModelRequest, db: AsyncSession = Depends(get_db)):
    from app.models import AgentModelRecord
    from app.llm.router import set_specialist_override
    from sqlalchemy import select

    res = await db.execute(
        select(AgentModelRecord).where(AgentModelRecord.specialist == specialist)
    )
    record = res.scalar_one_or_none()
    if record:
        record.model_id = payload.model_id
    else:
        db.add(AgentModelRecord(specialist=specialist, model_id=payload.model_id))
    await db.commit()
    set_specialist_override(specialist, payload.model_id)
    return {"status": "success", "specialist": specialist, "model_id": payload.model_id}


@router.delete("/agent-models/{specialist}")
async def delete_agent_model(specialist: str, db: AsyncSession = Depends(get_db)):
    from app.models import AgentModelRecord
    from app.llm.router import set_specialist_override
    from sqlalchemy import select

    res = await db.execute(
        select(AgentModelRecord).where(AgentModelRecord.specialist == specialist)
    )
    record = res.scalar_one_or_none()
    if record:
        db.delete(record)
        await db.commit()
    set_specialist_override(specialist, None)
    return {"status": "success", "specialist": specialist}


@router.get("/llm-logs")
async def download_llm_logs():
    from app.config import settings
    log_path = os.path.join(settings.datapilot_data_dir, "llm_prompts.log")
    if not os.path.exists(log_path):
        raise HTTPException(status_code=404, detail="LLM prompts log file not found")
    return FileResponse(
        log_path,
        media_type="application/x-jsonlines",
        filename="llm_prompts.jsonl"
    )
