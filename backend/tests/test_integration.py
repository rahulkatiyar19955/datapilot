"""
End-to-end integration smoke for the Phase 3 ingestion pipeline.

Exercises run_ingestion against the `lidar_failure.mcap` demo dataset and
asserts the full chain (parse → embed → causal rules → SQLite/Neo4j writes)
without touching real Neo4j (mocked via conftest's `mock_neo4j` autouse).
"""
from __future__ import annotations

import asyncio
import json
import uuid

import pytest
from sqlalchemy import select

from app.db_sqlite import AsyncSessionLocal, init_db
from app.models import SessionRecord
from app.api.sessions import run_ingestion


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    asyncio.run(init_db())


def test_full_ingestion_pipeline_against_lidar_demo(mock_neo4j):
    """
    Drive run_ingestion end-to-end and verify:
      - SessionRecord.status flips from 'processing' → 'ready'
      - All expected Neo4j writers were called (logs, topics, frames, anomalies, edges)
      - At least one causal edge (CAUSED or TRIGGERED) was produced from the YAML rules
      - SessionRecord.anomalies_json is populated with the timeline-derived anomalies
    """
    session_id = f"test-lidar-{uuid.uuid4()}"  # unique per run so reruns don't collide
    filepath = "lidar_failure.mcap"  # resolves via DEMO_DATASETS

    async def _arrange_and_act():
        async with AsyncSessionLocal() as db:
            db.add(SessionRecord(
                id=session_id,
                filename=filepath,
                filepath=filepath,
                status="processing",
            ))
            await db.commit()

        await run_ingestion(session_id, filepath)

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
            return res.scalar_one()

    record = asyncio.run(_arrange_and_act())

    # 1. Status flipped to ready
    assert record.status == "ready", f"expected 'ready', got {record.status!r} (error={record.error_message})"

    # 2. Metadata persisted from demo dataset
    assert record.robot_name == "ARES-04"
    assert record.total_messages == 35300  # total_messages from demo dataset (not just log count)
    assert record.duration_seconds == 128.0

    # 3. Neo4j writers were each called
    mock_neo4j.write_logs.assert_called_once()
    mock_neo4j.write_topics.assert_called_once()
    mock_neo4j.write_frames.assert_called_once()
    mock_neo4j.write_anomalies.assert_called_once()
    mock_neo4j.write_edges.assert_called_once()

    # 4. write_logs received all 12 demo logs (with embeddings attached)
    logs_call = mock_neo4j.write_logs.call_args
    written_session_id, written_logs = logs_call.args
    assert written_session_id == session_id
    assert len(written_logs) == 12
    # Every non-DEBUG log got an embedding; DEBUG ones are None
    non_debug = [l for l in written_logs if l.get("sev", "").upper() != "DEBUG"]
    assert all(l.get("embedding") is not None for l in non_debug)

    # 5. write_anomalies received the 3 demo anomalies — `timeline_events`
    # marks these explicitly with type=='anomaly':
    #   t=58.3 /perception/objects (warning), t=64.2 /sensors/lidar_a (critical),
    #   t=66.3 /cmd_vel (critical, e-brake).
    anomalies_call = mock_neo4j.write_anomalies.call_args
    written_anomaly_session_id, written_anomalies = anomalies_call.args
    assert written_anomaly_session_id == session_id
    assert len(written_anomalies) == 3
    anomaly_topics = {a["topic"] for a in written_anomalies}
    assert "/sensors/lidar_a" in anomaly_topics
    assert "/cmd_vel" in anomaly_topics              # e-brake anomaly
    assert "/perception/objects" in anomaly_topics   # frame dropout
    # Each anomaly should have a source_log_id picked from the nearest log
    assert all(a["source_log_id"] is not None for a in written_anomalies)

    # 6. write_edges produced at least one CAUSED/TRIGGERED edge from the YAML rules
    edges_call = mock_neo4j.write_edges.call_args
    (written_edges,) = edges_call.args
    causal_edges = [e for e in written_edges if e["type"] in {"CAUSED", "TRIGGERED"}]
    assert len(causal_edges) >= 1, "expected at least one causal edge from the YAML rule engine"

    # 7. anomalies_json round-trips back via SQLite
    stored = json.loads(record.anomalies_json or "[]")
    assert len(stored) == 3
    assert {a["id"] for a in stored} == {"a_1", "a_2", "a_3"}
