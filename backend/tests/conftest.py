import os
import sys
import pytest
from unittest.mock import MagicMock

# Force test environment variables
os.environ["DATAPILOT_DATA_DIR"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data_test"))
os.environ["NEO4J_URI"] = "bolt://localhost:7687"
os.environ["NEO4J_USER"] = "neo4j"
os.environ["NEO4J_PASSWORD"] = "test-pass"

# Add backend directory to sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Mock Neo4j client connection globally during tests to avoid container dependency checks
@pytest.fixture(autouse=True)
def mock_neo4j():
    from app.services.neo4j_client import neo4j_client
    # Mock Neo4j driver and sessions
    neo4j_client.driver = MagicMock()
    neo4j_client.init_indexes = MagicMock()
    neo4j_client.clear_session = MagicMock()
    neo4j_client.write_logs = MagicMock()
    neo4j_client.write_topics = MagicMock()
    neo4j_client.write_frames = MagicMock()
    neo4j_client.create_session_node = MagicMock()
    neo4j_client.write_edges = MagicMock()
    neo4j_client.write_anomalies = MagicMock()
    neo4j_client.run_query = MagicMock(return_value=[])
    yield neo4j_client
