from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
import json
import re
import uuid
from typing import List, Optional
import aiosqlite
from pathlib import Path

from app.db_sqlite import get_db, AsyncSessionLocal
from app.models import SessionRecord
from app.config import settings
from app.schemas import (
    SessionCreate, SessionResponse, TimelineEvent, TopicInfo, LogItem,
    KGraphResponse, ReplayResponse, AnomalyItem,
)
from app.services.parser import ingestion_parser
from app.services.embeddings import embedding_service
from app.services.neo4j_client import neo4j_client
from app.services.causal_rules import causal_rules_evaluator, log_time_to_seconds
from app.services.kgraph_builder import build_kgraph

router = APIRouter(prefix="/sessions", tags=["sessions"])

_CHECKPOINTS_DB = Path(settings.datapilot_data_dir) / "agent_checkpoints.sqlite"


async def _clear_checkpoints_for_session(session_id: str) -> None:
    """Remove LangGraph checkpoint rows for a single session."""
    try:
        if not _CHECKPOINTS_DB.exists():
            return
        async with aiosqlite.connect(str(_CHECKPOINTS_DB)) as db:
            await db.execute("DELETE FROM checkpoints WHERE thread_id = ?", (session_id,))
            await db.execute("DELETE FROM checkpoint_writes WHERE thread_id = ?", (session_id,))
            await db.commit()
    except Exception as e:
        print(f"Warning: could not clear checkpoints for {session_id}: {e}")


async def _clear_all_checkpoints() -> None:
    """Truncate all LangGraph checkpoint data."""
    try:
        if not _CHECKPOINTS_DB.exists():
            return
        async with aiosqlite.connect(str(_CHECKPOINTS_DB)) as db:
            await db.execute("DELETE FROM checkpoints")
            await db.execute("DELETE FROM checkpoint_writes")
            await db.commit()
    except Exception as e:
        print(f"Warning: could not clear all checkpoints: {e}")


def _basename(filepath: str) -> str:
    """Cross-platform basename — splits on both `/` and `\\` so Windows paths
    render the filename rather than the full absolute path. Mirrors the
    rendererside helper in `src/renderer/App.tsx`."""
    parts = re.split(r"[/\\]", filepath)
    return parts[-1] if parts else filepath

async def run_ingestion(session_id: str, filepath: str):
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        record = res.scalar_one_or_none()
        if not record:
            return
        
        try:
            # 1. Parse ROS telemetry (via mcap-parser service, falls back to inline CDR parser)
            parsed = await ingestion_parser.parse_bag(filepath)
            
            # 2. Vectorize log lines (DEBUG logs stored without embedding to
            # save cost — they're rarely useful for diagnosis).
            logs = parsed.get("logs", [])
            non_debug_logs = [l for l in logs if l.get("sev", "").upper() != "DEBUG"]
            log_texts = [embedding_service.format_log_text(l) for l in non_debug_logs]

            embeddings = embedding_service.embed_texts(log_texts)

            emb_idx = 0
            for l in logs:
                if l.get("sev", "").upper() != "DEBUG":
                    l["embedding"] = embeddings[emb_idx]
                    emb_idx += 1
                else:
                    l["embedding"] = None

            # Initialize Neo4j Indexes
            dim = embedding_service.get_embedding_dimension()
            neo4j_client.init_indexes(embedding_dim=dim)
            
            # Clear Neo4j entries for this session ID
            neo4j_client.clear_session(session_id)
            
            # Create main session node
            neo4j_client.create_session_node(
                session_id=session_id,
                filename=parsed["filename"],
                robot_id=parsed.get("robot_name", "robot"),
                duration_s=parsed.get("duration_seconds", 0.0),
                started_at=parsed.get("start_time", "")
            )
            
            # Write components into Neo4j Graph
            neo4j_client.write_logs(session_id, logs)
            neo4j_client.write_topics(session_id, parsed.get("topics", []))
            neo4j_client.write_frames(session_id, parsed.get("frames", []))
            
            # Write sensors and diagnostics
            neo4j_client.write_sensors(session_id, parsed.get("sensors", []))
            neo4j_client.write_diagnostics(session_id, parsed.get("diagnostics", []))

            # 3. Anomalies (Phase 3 seeds these from parsed timeline events;
            # Phase 5 AnomalyDetector worker will write more via the same shape).
            anomalies = parsed.get("anomalies", [])
            neo4j_client.write_anomalies(session_id, anomalies)

            # 4. Evaluate Causal Rules
            edges = causal_rules_evaluator.evaluate(logs)
            neo4j_client.write_edges(edges)

            # 5. Build knowledge graph from ingested data
            kgraph = build_kgraph(
                sensors=parsed.get("sensors", []),
                anomalies=anomalies,
                logs=logs,
                causal_edges=edges,
            )

            # 6. Save metadata caches to SQLite Record
            record.status = "ready"
            record.robot_name = parsed.get("robot_name")
            record.ros_version = parsed.get("ros_version")
            record.duration_seconds = parsed.get("duration_seconds")
            record.start_time = parsed.get("start_time")
            record.end_time = parsed.get("end_time")
            record.total_messages = parsed.get("total_messages", 0) or len(logs)
            record.topics_list = json.dumps([t["name"] for t in parsed.get("topics", [])])
            record.timeline_json = json.dumps(parsed.get("timeline_events", []))
            record.topics_json = json.dumps(parsed.get("topics", []))
            # Prefer the kgraph built from real ingested data; fall back to
            # whatever the parser produced (e.g. the mock test fixtures).
            parsed_kgraph = parsed.get("kgraph", {"nodes": [], "edges": []})
            if kgraph["nodes"]:
                record.kgraph_json = json.dumps(kgraph)
            else:
                record.kgraph_json = json.dumps(parsed_kgraph)
            record.replay_json = json.dumps(parsed.get("replay", []))
            record.anomalies_json = json.dumps(anomalies)
            
            await db.commit()
        except Exception as e:
            record.status = "error"
            record.error_message = str(e)
            await db.commit()
            print(f"Ingestion failed for session {session_id}: {e}")

@router.post("/create", status_code=202)
async def create_session(
    payload: SessionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    session_id = str(uuid.uuid4())
    filename = _basename(payload.filepath)
    
    # Store initial record in SQLite
    new_record = SessionRecord(
        id=session_id,
        filename=filename,
        filepath=payload.filepath,
        status="processing"
    )
    db.add(new_record)
    await db.commit()
    
    # Start ingestion background task
    background_tasks.add_task(run_ingestion, session_id, payload.filepath)
    
    return {
        "session_id": session_id,
        "filepath": payload.filepath,
        "status": "processing"
    }

@router.get("", response_model=List[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(SessionRecord)
        .options(selectinload(SessionRecord.messages))
        .order_by(SessionRecord.created_at.desc())
    )
    records = res.scalars().unique().all()
    response = []
    for record in records:
        topics = []
        if record.topics_list:
            try:
                topics = json.loads(record.topics_list)
            except Exception:
                topics = []
        response.append(SessionResponse(
            id=record.id,
            filename=record.filename,
            filepath=record.filepath,
            robot_name=record.robot_name,
            ros_version=record.ros_version,
            duration_seconds=record.duration_seconds,
            start_time=record.start_time,
            end_time=record.end_time,
            total_messages=record.total_messages,
            topics_list=topics,
            status=record.status,
            error_message=record.error_message,
            created_at=record.created_at,
            updated_at=max([m.created_at for m in record.messages], default=record.created_at) if record.messages else record.created_at
        ))
    return response

@router.delete("/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        neo4j_client.clear_session(session_id)
    except Exception as e:
        print(f"Error clearing neo4j for session {session_id}: {e}")

    await _clear_checkpoints_for_session(session_id)
    await db.delete(record)
    await db.commit()
    return {"status": "success", "message": f"Session {session_id} deleted"}

@router.delete("")
async def delete_all_sessions(db: AsyncSession = Depends(get_db)):
    try:
        neo4j_client.run_query("MATCH (n) DETACH DELETE n")
    except Exception as e:
        print(f"Error clearing neo4j: {e}")

    await _clear_all_checkpoints()
    await db.execute(delete(SessionRecord))
    await db.commit()
    return {"status": "success", "message": "All sessions cleared"}

@router.get("/{session_id}", response_model=SessionResponse)

async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Map topics_list field back to array
    topics = []
    if record.topics_list:
        topics = json.loads(record.topics_list)
        
    return SessionResponse(
        id=record.id,
        filename=record.filename,
        filepath=record.filepath,
        robot_name=record.robot_name,
        ros_version=record.ros_version,
        duration_seconds=record.duration_seconds,
        start_time=record.start_time,
        end_time=record.end_time,
        total_messages=record.total_messages,
        topics_list=topics,
        status=record.status,
        error_message=record.error_message,
        created_at=record.created_at
    )

@router.get("/{session_id}/timeline", response_model=List[TimelineEvent])
async def get_timeline(session_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.status != "ready":
        return []
    return json.loads(record.timeline_json or "[]")

@router.get("/{session_id}/topics", response_model=List[TopicInfo])
async def get_topics(session_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.status != "ready":
        return []
    return json.loads(record.topics_json or "[]")

@router.get("/{session_id}/logs", response_model=List[LogItem])
async def get_logs(
    session_id: str,
    q: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Search or query nodes in Neo4j
    if q:
        # Perform semantic vector query if embeddings ready, else full-text query
        try:
            dim = embedding_service.get_embedding_dimension()
            query_vector = embedding_service.embed_texts([q])[0]

            # Pagination: pull `limit + offset` from the vector index, then
            # apply SKIP/LIMIT to honor the caller's offset. The vector index
            # itself has no concept of offset.
            cypher = """
            MATCH (s:Session {id: $session_id})
            CALL db.index.vector.queryNodes('log_embedding_idx', $vector_limit, $query_vector)
            YIELD node, score
            MATCH (s)-[:HAS_LOG]->(node)
            WHERE ($severity IS NULL OR node.severity = $severity)
            RETURN node.ts as t, node.node as node, node.severity as sev, node.msg as text, node.id as id
            SKIP $offset LIMIT $limit
            """
            params = {
                "session_id": session_id,
                "query_vector": query_vector,
                "severity": severity.upper() if severity else None,
                "vector_limit": limit + offset,
                "offset": offset,
                "limit": limit,
            }
            results = neo4j_client.run_query(cypher, params)
            return [LogItem(**r) for r in results]
        except Exception as e:
            # Fall back to Cypher fulltext query
            print(f"Vector search failed, using full-text search: {e}")
            cypher = """
            MATCH (s:Session {id: $session_id})
            CALL db.index.fulltext.queryNodes('log_msg_fulltext', $q)
            YIELD node, score
            MATCH (s)-[:HAS_LOG]->(node)
            WHERE ($severity IS NULL OR node.severity = $severity)
            RETURN node.ts as t, node.node as node, node.severity as sev, node.msg as text, node.id as id
            ORDER BY score DESC
            SKIP $offset LIMIT $limit
            """
            params = {
                "session_id": session_id,
                "q": q,
                "severity": severity.upper() if severity else None,
                "offset": offset,
                "limit": limit
            }
            results = neo4j_client.run_query(cypher, params)
            return [LogItem(**r) for r in results]
    else:
        # Standard retrieve sorted by timestamp
        cypher = """
        MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log)
        WHERE ($severity IS NULL OR l.severity = $severity)
        RETURN l.ts as t, l.node as node, l.severity as sev, l.msg as text, l.id as id
        ORDER BY l.ts ASC
        SKIP $offset LIMIT $limit
        """
        params = {
            "session_id": session_id,
            "severity": severity.upper() if severity else None,
            "offset": offset,
            "limit": limit
        }
        results = neo4j_client.run_query(cypher, params)
        return [LogItem(**r) for r in results]

@router.get("/{session_id}/kgraph", response_model=KGraphResponse)
async def get_kgraph(session_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.status != "ready":
        return KGraphResponse(nodes=[], edges=[])
    return KGraphResponse(**json.loads(record.kgraph_json or '{"nodes": [], "edges": []}'))

@router.get("/{session_id}/causal-chain", response_model=List[LogItem])
async def get_causal_chain(
    session_id: str,
    event_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Traverse upstream CAUSED/TRIGGERED relations
    cypher = """
    MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(target:Log {id: $event_id})
    MATCH path = (source:Log)-[:CAUSED|TRIGGERED*0..5]->(target)
    UNWIND nodes(path) as n
    RETURN DISTINCT n.id as id, n.ts as t, n.node as node, n.severity as sev, n.msg as text
    """
    results = neo4j_client.run_query(cypher, {"session_id": session_id, "event_id": event_id})
    # Sort by numeric seconds, not by string — `"10:00:00"` would otherwise
    # sort BEFORE `"2:00:00"` for unpadded hours, and beyond 99h the lexical
    # order silently diverges from chronological order.
    results.sort(key=lambda x: log_time_to_seconds(x.get("t", "0")))
    return [LogItem(**r) for r in results]

@router.get("/{session_id}/replay", response_model=ReplayResponse)
async def get_replay(session_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.status != "ready":
        return ReplayResponse(frames=[])
    return ReplayResponse(frames=json.loads(record.replay_json or "[]"))


@router.get("/{session_id}/anomalies", response_model=List[AnomalyItem])
async def get_anomalies(session_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns the anomalies detected for this session.

    Phase 3 seeds these from `timeline_events[type=='anomaly']` during ingestion.
    Phase 5's AnomalyDetector worker will append richer entries with proper
    statistical/signature `kind` values.
    """
    res = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.status != "ready":
        return []
    return json.loads(record.anomalies_json or "[]")
