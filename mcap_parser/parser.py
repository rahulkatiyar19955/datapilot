"""
Multi-encoding MCAP / ROS bag parser.

Handles:
- ROS 2 CDR encoding  (rcl_interfaces/msg/Log, tf2_msgs/msg/TFMessage, …)
- Foxglove protobuf   (foxglove.Log)
- .db3 bags           (rosbags CDR path, unchanged)

Unknown encodings are skipped with a warning; the caller receives the
warnings list in the response so the UI can surface them.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Schema helpers ────────────────────────────────────────────────────────────

# All schema names that represent a ROS log message.
_LOG_SCHEMAS = frozenset([
    "rcl_interfaces/msg/Log",   # ROS 2 standard (/rosout)
    "rosgraph_msgs/Log",        # ROS 1 compat
    "foxglove.Log",             # Foxglove Studio (protobuf)
])

# Schema names for TF transforms.
_TF_SCHEMAS = frozenset([
    "tf2_msgs/msg/TFMessage",
    "geometry_msgs/msg/TransformStamped",
])

_SEV_INT_MAP = {10: "DEBUG", 20: "INFO", 30: "WARN", 40: "ERROR", 50: "FATAL"}

# Foxglove.Log numeric level → severity string
_FOXGLOVE_LEVEL_MAP = {0: "INFO", 1: "DEBUG", 2: "INFO", 3: "WARN", 4: "ERROR", 5: "FATAL"}


# ── Inline TF parser (no backend dependency) ─────────────────────────────────

class _TFParser:
    def __init__(self) -> None:
        self.frames: dict[str, str] = {}

    def parse(self, msg: Any) -> None:
        try:
            transforms = getattr(msg, "transforms", None) or []
            if not transforms and isinstance(msg, dict):
                transforms = msg.get("transforms", [])
            for t in transforms:
                child = getattr(t, "child_frame_id", None) or (
                    t.get("child_frame_id") if isinstance(t, dict) else None
                )
                header = getattr(t, "header", None)
                parent = (
                    getattr(header, "frame_id", None)
                    if header else
                    (t.get("header", {}).get("frame_id") if isinstance(t, dict) else None)
                )
                if child and parent:
                    self.frames[child.lstrip("/")] = parent.lstrip("/")
        except Exception:
            pass

    def frames_list(self) -> list[dict[str, str]]:
        return [{"name": c, "parent": p} for c, p in self.frames.items()]


# ── Anomaly derivation (matches backend logic) ────────────────────────────────

def _derive_anomalies(timeline_events: list[dict], logs: list[dict]) -> list[dict]:
    anomalies = []
    for ev in timeline_events:
        if ev.get("type") == "log" and ev.get("sev") in ("error", "fatal"):
            anomalies.append({
                "id": f"a_{len(anomalies) + 1}",
                "t": ev["t"],
                "kind": ev.get("topic", "unknown"),
                "severity": "critical" if ev["sev"] == "fatal" else "high",
                "label": ev.get("label", ""),
            })
    return anomalies


# ── Foxglove protobuf decoder ─────────────────────────────────────────────────

def _decode_foxglove_log(
    raw: bytes,
    timestamp: float,
    start_time: float,
    warnings: list[str],
) -> dict[str, Any] | None:
    try:
        from foxglove_schemas_protobuf.Log_pb2 import Log as FoxgloveLog  # type: ignore[import]
        msg = FoxgloveLog()
        msg.ParseFromString(raw)
        sev = _FOXGLOVE_LEVEL_MAP.get(msg.level, "INFO")
        return {
            "t": str(timedelta(seconds=timestamp - start_time)),
            "node": msg.name or "unknown",
            "sev": sev,
            "text": msg.message,
            "topic": "foxglove.Log",
        }
    except Exception as exc:
        warnings.append(f"foxglove.Log decode error: {exc}")
        return None


# ── MCAP parser ───────────────────────────────────────────────────────────────

def _parse_mcap(filepath: str) -> dict[str, Any]:
    from mcap.reader import make_reader
    from mcap_ros2.reader import read_ros2_messages

    warnings: list[str] = []
    tf_parser = _TFParser()
    logs: list[dict] = []
    timeline_events: list[dict] = []
    start_time: float | None = None
    end_time: float | None = None

    # ── Pass 1: topic catalog + identify protobuf log channels ────────────────
    proto_log_topics: set[str] = set()
    topics_dict: dict[str, dict] = {}

    with open(filepath, "rb") as f:
        summary = make_reader(f).get_summary()
        if summary is None:
            warnings.append("MCAP summary unavailable — skipping topic catalog")
        else:
            for channel in summary.channels.values():
                schema = summary.schemas.get(channel.schema_id)
                schema_name = schema.name if schema else "unknown"
                encoding = getattr(channel, "message_encoding", "cdr")
                topics_dict[channel.topic] = {
                    "name": channel.topic,
                    "hz": 0.0,
                    "type": schema_name,
                    "msgs": 0,
                }
                if schema_name in _LOG_SCHEMAS and encoding == "protobuf":
                    proto_log_topics.add(channel.topic)
                    logger.info(
                        "Detected protobuf log topic: %s (schema=%s)",
                        channel.topic, schema_name,
                    )

    # ── Pass 2a: CDR decoding via mcap_ros2 (ROS 2 standard) ─────────────────
    CDR_LOG_TOPICS = {"/rosout"}
    CDR_TF_TOPICS = {"/tf", "/tf_static"}

    try:
        for msg_info in read_ros2_messages(filepath):
            topic = msg_info.channel.topic
            timestamp = msg_info.log_time / 1e9

            if start_time is None:
                start_time = timestamp
            end_time = timestamp

            if topic in topics_dict:
                topics_dict[topic]["msgs"] += 1

            if topic not in CDR_LOG_TOPICS and topic not in CDR_TF_TOPICS:
                continue

            msg = msg_info.ros_msg

            if topic in CDR_LOG_TOPICS:
                node = getattr(msg, "name", "unknown")
                msg_text = getattr(msg, "msg", "")
                level_int = getattr(msg, "level", 20)
                sev = _SEV_INT_MAP.get(level_int, "INFO")
                logs.append({
                    "t": str(timedelta(seconds=timestamp - (start_time or timestamp))),
                    "node": node,
                    "sev": sev,
                    "text": msg_text,
                    "topic": topic,
                })
                if sev in ("WARN", "ERROR", "FATAL"):
                    timeline_events.append({
                        "t": float(timestamp - (start_time or timestamp)),
                        "type": "log",
                        "sev": sev.lower(),
                        "topic": topic,
                        "label": msg_text[:40],
                    })

            elif topic in CDR_TF_TOPICS:
                tf_parser.parse(msg)

    except Exception as exc:
        warnings.append(f"CDR decoding pass failed: {exc}")
        logger.warning("CDR pass error for %s: %s", filepath, exc)

    # ── Pass 2b: protobuf log channels (Foxglove Studio recordings) ───────────
    if proto_log_topics:
        try:
            with open(filepath, "rb") as f:
                reader = make_reader(f)
                for schema, channel, message in reader.iter_messages(
                    topics=list(proto_log_topics)
                ):
                    timestamp = message.log_time / 1e9
                    if start_time is None:
                        start_time = timestamp
                    end_time = max(end_time or 0.0, timestamp)

                    if channel.topic in topics_dict:
                        topics_dict[channel.topic]["msgs"] += 1

                    schema_name = schema.name if schema else ""
                    if schema_name == "foxglove.Log":
                        entry = _decode_foxglove_log(
                            message.data, timestamp, start_time or timestamp, warnings
                        )
                        if entry:
                            if entry["sev"] in ("WARN", "ERROR", "FATAL"):
                                timeline_events.append({
                                    "t": float(timestamp - (start_time or timestamp)),
                                    "type": "log",
                                    "sev": entry["sev"].lower(),
                                    "topic": entry["topic"],
                                    "label": entry["text"][:40],
                                })
                            logs.append(entry)
                    else:
                        warnings.append(
                            f"topic {channel.topic!r} (schema={schema_name!r}, "
                            f"protobuf): schema not recognized — skipped"
                        )

        except Exception as exc:
            warnings.append(f"Protobuf decoding pass failed: {exc}")
            logger.warning("Protobuf pass error for %s: %s", filepath, exc)

    # ── Finalise ──────────────────────────────────────────────────────────────
    dur = (end_time - start_time) if start_time is not None and end_time is not None else 0.0

    # Assign sequential IDs and sort by relative timestamp
    logs.sort(key=lambda l: l["t"])
    for idx, log in enumerate(logs):
        log["id"] = f"l_{idx + 1}"

    total_messages = 0
    for td in topics_dict.values():
        td["hz"] = round(td["msgs"] / dur, 2) if dur > 0 else 0.0
        total_messages += td["msgs"]

    return {
        "ok": True,
        "session_id": str(uuid.uuid4()),
        "filename": os.path.basename(filepath),
        "filepath": filepath,
        "robot_name": "ARES-ROBOT",
        "ros_version": "ROS 2",
        "duration_seconds": dur,
        "start_time": datetime.fromtimestamp(start_time).isoformat() if start_time else None,
        "end_time": datetime.fromtimestamp(end_time).isoformat() if end_time else None,
        "total_messages": total_messages,
        "topics": list(topics_dict.values()),
        "timeline_events": timeline_events,
        "logs": logs,
        "anomalies": _derive_anomalies(timeline_events, logs),
        "kgraph": {"nodes": [], "edges": []},
        "frames": tf_parser.frames_list(),
        "replay": [],
        "parse_warnings": warnings,
    }


# ── DB3 / SQLite bag parser ───────────────────────────────────────────────────

def _parse_db3(filepath: str) -> dict[str, Any]:
    from rosbags.rosbag2 import Reader
    from rosbags.serde import deserialize_cdr

    warnings: list[str] = []
    tf_parser = _TFParser()
    logs: list[dict] = []
    timeline_events: list[dict] = []
    topics_dict: dict[str, dict] = {}
    start_time: float | None = None
    end_time: float | None = None

    DECODE_TOPICS = {"/rosout", "/tf", "/tf_static"}

    try:
        with Reader(filepath) as reader:
            for connection in reader.connections:
                topics_dict[connection.topic] = {
                    "name": connection.topic,
                    "hz": 0.0,
                    "type": connection.msgtype,
                    "msgs": 0,
                }

            for connection, timestamp_ns, rawdata in reader.messages():
                topic = connection.topic
                timestamp = timestamp_ns / 1e9

                if start_time is None:
                    start_time = timestamp
                end_time = timestamp

                if topic in topics_dict:
                    topics_dict[topic]["msgs"] += 1

                if topic not in DECODE_TOPICS:
                    continue

                try:
                    msg = deserialize_cdr(rawdata, connection.msgtype)
                except Exception as exc:
                    warnings.append(f"CDR decode failed for {topic!r} ({connection.msgtype}): {exc}")
                    continue

                if topic == "/rosout":
                    node = getattr(msg, "name", "unknown")
                    msg_text = getattr(msg, "msg", "")
                    level_int = getattr(msg, "level", 20)
                    sev = _SEV_INT_MAP.get(level_int, "INFO")
                    logs.append({
                        "t": str(timedelta(seconds=timestamp - (start_time or timestamp))),
                        "node": node,
                        "sev": sev,
                        "text": msg_text,
                        "topic": topic,
                    })
                    if sev in ("WARN", "ERROR", "FATAL"):
                        timeline_events.append({
                            "t": float(timestamp - (start_time or timestamp)),
                            "type": "log",
                            "sev": sev.lower(),
                            "topic": topic,
                            "label": msg_text[:40],
                        })
                elif topic in ("/tf", "/tf_static"):
                    tf_parser.parse(msg)

    except Exception as exc:
        warnings.append(f"DB3 reader failed: {exc}")
        logger.exception("DB3 parse error for %s", filepath)

    dur = (end_time - start_time) if start_time is not None and end_time is not None else 0.0

    logs.sort(key=lambda l: l["t"])
    for idx, log in enumerate(logs):
        log["id"] = f"l_{idx + 1}"

    total_messages = 0
    for td in topics_dict.values():
        td["hz"] = round(td["msgs"] / dur, 2) if dur > 0 else 0.0
        total_messages += td["msgs"]

    return {
        "ok": True,
        "session_id": str(uuid.uuid4()),
        "filename": os.path.basename(filepath),
        "filepath": filepath,
        "robot_name": "ARES-ROBOT",
        "ros_version": "ROS 2",
        "duration_seconds": dur,
        "start_time": datetime.fromtimestamp(start_time).isoformat() if start_time else None,
        "end_time": datetime.fromtimestamp(end_time).isoformat() if end_time else None,
        "total_messages": total_messages,
        "topics": list(topics_dict.values()),
        "timeline_events": timeline_events,
        "logs": logs,
        "anomalies": _derive_anomalies(timeline_events, logs),
        "kgraph": {"nodes": [], "edges": []},
        "frames": tf_parser.frames_list(),
        "replay": [],
        "parse_warnings": warnings,
    }


# ── Public entry point ────────────────────────────────────────────────────────

def parse_bag(filepath: str) -> dict[str, Any]:
    """Parse an MCAP or DB3 bag file. Returns a structured dict.

    The file path must be accessible inside this container
    (typically a /host-mounted path translated by the caller).
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Bag file not found: {filepath!r}")

    ext = Path(filepath).suffix.lower()
    if ext == ".mcap":
        return _parse_mcap(filepath)
    if ext in (".db3", ".bag"):
        return _parse_db3(filepath)
    raise ValueError(f"Unsupported bag format: {ext!r} ({filepath})")
