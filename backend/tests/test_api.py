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
