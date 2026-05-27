from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import relationship
from app.db_sqlite import Base

class SessionRecord(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    robot_name = Column(String, nullable=True)
    ros_version = Column(String, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    total_messages = Column(Integer, nullable=True)
    topics_list = Column(Text, nullable=True)  # JSON-encoded list of topics
    timeline_json = Column(Text, nullable=True)  # JSON-encoded timeline events
    topics_json = Column(Text, nullable=True)  # JSON-encoded detailed topics
    kgraph_json = Column(Text, nullable=True)  # JSON-encoded knowledge graph layout
    replay_json = Column(Text, nullable=True)  # JSON-encoded replay frames
    anomalies_json = Column(Text, nullable=True)  # JSON-encoded anomalies (Phase 3)
    status = Column(String, default="processing", nullable=False)  # "processing", "ready", "error"
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    messages = relationship("ChatMessageRecord", back_populates="session", cascade="all, delete-orphan")
    costs = relationship("SessionCostRecord", back_populates="session", cascade="all, delete-orphan")


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    execution_steps = Column(Text, nullable=True)  # JSON array of tools executed
    citations = Column(Text, nullable=True)  # JSON array of source log links
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    session = relationship("SessionRecord", back_populates="messages")


class AgentModelRecord(Base):
    __tablename__ = "agent_models"

    specialist = Column(String, primary_key=True)  # e.g., "RootCauseAnalyst"
    model_id = Column(String, nullable=False)      # e.g., "claude-3-5-sonnet-latest"


class SessionCostRecord(Base):
    __tablename__ = "session_costs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    turn_index = Column(Integer, nullable=False)
    tokens_in = Column(Integer, nullable=False)
    tokens_out = Column(Integer, nullable=False)
    est_cost_usd = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    session = relationship("SessionRecord", back_populates="costs")
