import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db_sqlite import init_db

# Initialize database once before running API tests
@pytest.fixture(scope="module", autouse=True)
def setup_database():
    import asyncio
    asyncio.run(init_db())

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "phase": "3",
        "service": "datapilot-backend"
    }

def test_session_lifecycle():
    # 1. Create session (async background task will start)
    response = client.post("/api/sessions/create", json={"filepath": "lidar_failure.mcap"})
    assert response.status_code == 202
    data = response.json()
    assert "session_id" in data
    assert data["status"] == "processing"
    
    session_id = data["session_id"]
    
    # 2. Get session details (should be immediately accessible in DB)
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    sess_data = response.json()
    assert sess_data["id"] == session_id
    assert sess_data["filename"] == "lidar_failure.mcap"

def test_download_llm_logs(tmp_path, monkeypatch):
    from app.config import settings
    # Override settings.datapilot_data_dir to a temp path
    monkeypatch.setattr(settings, "datapilot_data_dir", str(tmp_path))

    # Prompt logging is opt-in (issue #61): when it is disabled, prompt
    # contents are never served even if a stale log file exists on disk.
    monkeypatch.delenv("DATAPILOT_PROMPT_LOGGING", raising=False)
    log_file = tmp_path / "llm_prompts.log"
    log_file.write_text("dummy log line\n")
    response = client.get("/api/settings/llm-logs")
    assert response.status_code == 404
    assert response.json()["detail"] == "LLM prompt logging is disabled"

    # When logging is explicitly enabled, the endpoint serves the log file.
    monkeypatch.setenv("DATAPILOT_PROMPT_LOGGING", "1")

    # 1. When file doesn't exist
    log_file.unlink()
    response = client.get("/api/settings/llm-logs")
    assert response.status_code == 404
    assert response.json()["detail"] == "LLM prompts log file not found"

    # 2. When file exists
    log_file.write_text("dummy log line\n")
    response = client.get("/api/settings/llm-logs")
    assert response.status_code == 200
    assert response.text == "dummy log line\n"
    assert response.headers["content-disposition"] == 'attachment; filename="llm_prompts.jsonl"'
