"""
Eval-specific fixtures.

Reuses the top-level `mock_neo4j` autouse fixture from `tests/conftest.py` and
adds per-case Neo4j stubbing so citation grounding tests can resolve the
canonical log_ids referenced by golden.yaml.

The canonical lidar_failure.mcap session has these log_ids (matching the
DEMO_DATASETS data in `app/services/parser.py`):
  - l_5: /sensors ERROR "Sensor dropout"
  - l_6: /costmap WARN "defensive inflation"
  - l_8: /move_base ERROR "Planner aborted"
  - l_9: /cmd_vel ERROR "emergency brake"
"""
from __future__ import annotations

import pytest


CANONICAL_LIDAR_LOGS = [
    {"log_id": "l_5", "ts": "00:01:04.215", "node": "/sensors", "msg": "Sensor dropout: /sensors/lidar_a no data for 782ms"},
    {"log_id": "l_6", "ts": "00:01:05.001", "node": "/costmap", "msg": "applying defensive inflation 0.45m -> 0.85m"},
    {"log_id": "l_8", "ts": "00:01:06.118", "node": "/move_base", "msg": "Planner aborted - no valid path"},
    {"log_id": "l_9", "ts": "00:01:06.310", "node": "/cmd_vel", "msg": "Velocity command zeroed; emergency brake engaged"},
]


@pytest.fixture(autouse=True)
def seed_canonical_logs(mock_neo4j):
    """Make `mock_neo4j.run_query` return the canonical lidar log set.
    The composer's citation-resolution Cypher will then resolve every log_id
    referenced by the mocked RCA finding."""
    mock_neo4j.run_query.return_value = CANONICAL_LIDAR_LOGS
    yield mock_neo4j
