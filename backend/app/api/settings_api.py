from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import logging
import os
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_sqlite import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

# Fixed, key-free messages returned to clients for the key-bearing endpoints
# (`test_key`, `list_provider_models`). Provider SDK exception strings can embed
# the API key or Authorization header, so they MUST NOT be echoed to the client
# or written to logs (see issue #60).
_AUTH_FAILED_MESSAGE = "Authentication failed"
_PROVIDER_FAILED_MESSAGE = "Request to provider failed"


def _is_auth_error(exc: Exception) -> bool:
    """Classify a provider exception as an auth failure WITHOUT reading its
    message (the message may contain the secret). We rely only on the
    exception type name and any numeric ``status_code``/``code`` attribute.
    """
    name = type(exc).__name__.lower()
    if "auth" in name or "permission" in name or "forbidden" in name:
        return True
    for attr in ("status_code", "code", "status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int) and value in (401, 403):
            return True
    return False


def _safe_provider_error(exc: Exception) -> HTTPException:
    """Build a client-safe HTTPException and emit a key-free log line.

    Only the exception *type name* is logged — never the message, which may
    contain the API key or Authorization header.
    """
    logger.warning("Provider request failed: %s", type(exc).__name__)
    detail = _AUTH_FAILED_MESSAGE if _is_auth_error(exc) else _PROVIDER_FAILED_MESSAGE
    return HTTPException(status_code=400, detail=detail)

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
    except HTTPException:
        raise
    except Exception as e:
        # NEVER surface the provider exception string — it can embed the API
        # key / Authorization header (issue #60). Return a fixed, key-free
        # message and log only the exception type.
        raise _safe_provider_error(e)

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

    except HTTPException:
        raise
    except Exception as e:
        # NEVER surface the provider exception string — it can embed the API
        # key / Authorization header (issue #60). Return a fixed, key-free
        # message and log only the exception type.
        raise _safe_provider_error(e)


class KeyUpdateRequest(BaseModel):
    provider: str
    key: str


def _apply_key_update(provider: str, key: Optional[str]) -> None:
    """Apply a single key/setting change through one place and ALWAYS clear the
    cached router (issue #77).

    Previously only the `default_model` branch invalidated the router cache, so
    a changed API key / provider was ignored by in-flight reads until restart.
    Routing through this setter keeps the mutation + cache-clear consistent.
    """
    from app.config import settings
    from app.llm.router import get_router

    p = (provider or "").lower()
    value = key or None
    if p == "openai":
        settings.openai_api_key = value
    elif p in ("google", "gemini"):
        settings.gemini_api_key = value
    elif p == "anthropic":
        settings.anthropic_api_key = value
    elif p == "nvidia":
        settings.nvidia_api_key = value
    elif p == "default_provider":
        settings.default_provider = value
    elif p == "default_model":
        settings.default_model = value

    # Any provider/key/model change can alter routing → drop the cached router
    # so the next turn rebuilds clients with the new settings.
    get_router.cache_clear()


@router.post("/keys")
async def update_key(payload: KeyUpdateRequest):
    _apply_key_update(payload.provider, payload.key.strip())
    return {"status": "success", "message": f"Updated API key for {payload.provider.lower()}"}


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
    from app.llm.logging_wrapper import prompt_logging_enabled

    # Prompt logging is opt-in (issue #61). When it is disabled we never serve
    # prompt contents, even if a stale log file is present on disk.
    if not prompt_logging_enabled():
        raise HTTPException(status_code=404, detail="LLM prompt logging is disabled")

    log_path = os.path.join(settings.datapilot_data_dir, "llm_prompts.log")
    if not os.path.exists(log_path):
        raise HTTPException(status_code=404, detail="LLM prompts log file not found")
    return FileResponse(
        log_path,
        media_type="application/x-jsonlines",
        filename="llm_prompts.jsonl"
    )
