from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class SessionCreate(BaseModel):
    filepath: str

class SessionResponse(BaseModel):
    id: str
    filename: str
    filepath: str
    robot_name: Optional[str] = None
    ros_version: Optional[str] = None
    duration_seconds: Optional[float] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_messages: Optional[int] = None
    topics_list: Optional[List[str]] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TimelineEvent(BaseModel):
    t: float
    type: str  # 'log', 'sensor', 'anomaly'
    sev: str  # 'info', 'warning', 'critical'
    topic: str
    label: str

class TopicInfo(BaseModel):
    name: str
    hz: float
    type: str
    msgs: int

class LogItem(BaseModel):
    t: str  # formatted timestamp
    node: str
    sev: str
    text: str
    id: Optional[str] = None

class KGraphNode(BaseModel):
    id: str
    label: str
    group: str  # 'sensor', 'fault', 'state', 'node', 'outcome'
    x: float
    y: float

class KGraphResponse(BaseModel):
    nodes: List[KGraphNode]
    edges: List[List[str]]  # List of [source_id, target_id]

class ReplayFrame(BaseModel):
    t: float
    pose: Optional[Dict[str, float]] = None  # {x, y, yaw}
    tf: Optional[List[Dict[str, Any]]] = None
    cmd_vel: Optional[Dict[str, float]] = None  # {linear, angular}

class ReplayResponse(BaseModel):
    frames: List[ReplayFrame]


class AnomalyItem(BaseModel):
    """
    Anomalies surfaced during ingestion. Phase 3 seeds these from timeline_events
    where `type == 'anomaly'`. Phase 5 (AnomalyDetector worker) will write richer
    entries with statistical/signature `kind` values.
    """
    id: str
    t: float                  # seconds from session start
    kind: str                 # topic name today; 'dropout'|'outlier'|'signature' in Phase 5
    severity: str             # 'critical' | 'warning' | 'info'
    source_log_id: Optional[str] = None
    confidence: float = 1.0
    topic: Optional[str] = None
    label: Optional[str] = None
