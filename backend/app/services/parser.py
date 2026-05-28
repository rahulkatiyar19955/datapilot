import os
import uuid
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List
import json

from app.services.tf_parser import TFParser

logger = logging.getLogger(__name__)

# The Docker container mounts the host home directory at this path (read-only).
# Set via the DATAPILOT_HOST_MOUNT env var in dockerOrchestrator.ts.
_HOST_MOUNT = os.environ.get("DATAPILOT_HOST_MOUNT", "")


def _resolve_path(filepath: str) -> str:
    """Translate a host filesystem path to its Docker-mounted equivalent.

    The orchestrator runs:  -v $HOME:/host:ro  and sets DATAPILOT_HOST_MOUNT=/host
    So  /Users/kati/Documents/robot.mcap  →  /host/Documents/robot.mcap

    Falls back to the original path when:
    - Running outside Docker (DATAPILOT_HOST_MOUNT not set)
    - The original path is already accessible
    - Translation doesn't help
    """
    if os.path.exists(filepath):
        return filepath  # already accessible — running outside Docker or path is correct

    if not _HOST_MOUNT:
        return filepath  # no mount env var → not inside Docker, can't translate

    p = Path(filepath)
    parts = p.parts  # e.g. ('/', 'Users', 'kati', 'Documents', 'robot.mcap')

    # Paths rooted at /Users/<name>/... (macOS) or /home/<name>/... (Linux)
    if len(parts) > 3 and parts[1] in ("Users", "home"):
        relative = Path(*parts[3:])  # strips /, Users/home, username
        translated = str(Path(_HOST_MOUNT) / relative)
        if os.path.exists(translated):
            logger.info("Resolved host path %s → %s", filepath, translated)
            return translated

    logger.warning("Could not resolve path %s (HOST_MOUNT=%s)", filepath, _HOST_MOUNT)
    return filepath

# High-Fidelity Mock Datasets for Demo Runs
DEMO_DATASETS = {
    "lidar_failure.mcap": {
        "robot_name": "ARES-04",
        "ros_version": "ROS 2 Humble",
        "duration_seconds": 128.0,
        "total_messages": 35300,
        "topics": [
            {"name": "/scan", "hz": 10.0, "type": "sensor_msgs/LaserScan", "msgs": 1284},
            {"name": "/sensors/lidar_a", "hz": 10.0, "type": "sensor_msgs/PointCloud2", "msgs": 1280},
            {"name": "/sensors/imu", "hz": 100.0, "type": "sensor_msgs/Imu", "msgs": 12801},
            {"name": "/odom", "hz": 50.0, "type": "nav_msgs/Odometry", "msgs": 6401},
            {"name": "/cmd_vel", "hz": 20.0, "type": "geometry_msgs/Twist", "msgs": 2560},
            {"name": "/tf", "hz": 100.0, "type": "tf2_msgs/TFMessage", "msgs": 12800},
            {"name": "/move_base/goal", "hz": 0.1, "type": "move_base_msgs/MoveBaseGoal", "msgs": 4},
            {"name": "/perception/objects", "hz": 15.0, "type": "vision_msgs/Detection3DArray", "msgs": 1920},
            {"name": "/costmap/inflated", "hz": 5.0, "type": "nav_msgs/OccupancyGrid", "msgs": 640},
            {"name": "/diagnostics", "hz": 1.0, "type": "diagnostic_msgs/DiagnosticArray", "msgs": 128}
        ],
        "timeline_events": [
            {"t": 12.4, "type": "log", "sev": "info", "topic": "/move_base", "label": "Goal received: bay_3_dock"},
            {"t": 28.1, "type": "log", "sev": "info", "topic": "/planner", "label": "Global plan computed (47 waypoints)"},
            {"t": 41.7, "type": "sensor", "sev": "info", "topic": "/scan", "label": "LiDAR scan stable, 12,840 pts/s"},
            {"t": 58.3, "type": "anomaly", "sev": "warning", "topic": "/perception/objects", "label": "Pedestrian detection: 3 frame dropout"},
            {"t": 64.2, "type": "anomaly", "sev": "critical", "topic": "/sensors/lidar_a", "label": "Sensor dropout (782 ms)"},
            {"t": 65.0, "type": "log", "sev": "warning", "topic": "/costmap", "label": "Inflation radius applied: 0.45m → 0.85m"},
            {"t": 65.4, "type": "log", "sev": "critical", "topic": "/recovery", "label": "Recovery behavior: clear_costmap triggered"},
            {"t": 66.1, "type": "log", "sev": "critical", "topic": "/move_base", "label": "Planner aborted: no valid path"},
            {"t": 66.3, "type": "anomaly", "sev": "critical", "topic": "/cmd_vel", "label": "Robot stopped (e-brake)"},
            {"t": 72.8, "type": "log", "sev": "info", "topic": "/diagnostics", "label": "LiDAR back online, retrying"},
            {"t": 81.5, "type": "log", "sev": "info", "topic": "/move_base", "label": "Plan re-attempt scheduled"},
            {"t": 94.2, "type": "log", "sev": "warning", "topic": "/perception/objects", "label": "Confidence dropped to 0.58 (avg 0.91)"}
        ],
        "logs": [
            {"t": "00:00:12.412", "node": "/move_base", "sev": "INFO", "text": "Received new goal: bay_3_dock (x=24.3, y=-8.1, yaw=1.57)", "topic": "/move_base"},
            {"t": "00:00:28.103", "node": "/planner", "sev": "INFO", "text": "Global plan computed: 47 waypoints, cost 124.8, time 412ms", "topic": "/planner"},
            {"t": "00:00:41.701", "node": "/scan", "sev": "DEBUG", "text": "LiDAR scan stable: 12840 pts/s, range 0.1-30.0m", "topic": "/scan"},
            {"t": "00:00:58.302", "node": "/perception", "sev": "WARN", "text": "Pedestrian tracker: lost 3 frames on track_id=14 (occlusion?)", "topic": "/perception/objects"},
            {"t": "00:01:04.215", "node": "/sensors", "sev": "ERROR", "text": "Sensor dropout: /sensors/lidar_a no data for 782ms (threshold 250ms)", "topic": "/sensors/lidar_a"},
            {"t": "00:01:05.001", "node": "/costmap", "sev": "WARN", "text": "Costmap update stale; applying defensive inflation 0.45m → 0.85m", "topic": "/costmap"},
            {"t": "00:01:05.412", "node": "/recovery", "sev": "ERROR", "text": "Recovery behavior triggered: clear_costmap_recovery (attempt 1/3)", "topic": "/recovery"},
            {"t": "00:01:06.118", "node": "/move_base", "sev": "ERROR", "text": "Planner aborted — no valid path within tolerance after 2 retries", "topic": "/move_base"},
            {"t": "00:01:06.310", "node": "/cmd_vel", "sev": "ERROR", "text": "Velocity command zeroed; emergency brake engaged", "topic": "/cmd_vel"},
            {"t": "00:01:12.804", "node": "/diagnostics", "sev": "INFO", "text": "LiDAR /sensors/lidar_a back online, latency 8ms, retrying plan", "topic": "/diagnostics"},
            {"t": "00:01:21.502", "node": "/move_base", "sev": "INFO", "text": "Replan scheduled at t+15s — operator confirmation required", "topic": "/move_base"},
            {"t": "00:01:34.221", "node": "/perception", "sev": "WARN", "text": "Detection confidence dropped to 0.58 (rolling avg 0.91) on object class=person", "topic": "/perception/objects"}
        ],
        "kgraph": {
            "nodes": [
                {"id": "sensor", "label": "/sensors/lidar_a", "group": "sensor", "x": 110, "y": 70},
                {"id": "dropout", "label": "sensor dropout", "group": "fault", "x": 110, "y": 200},
                {"id": "costmap", "label": "costmap inflation", "group": "state", "x": 320, "y": 130},
                {"id": "planner", "label": "/move_base planner", "group": "node", "x": 320, "y": 280},
                {"id": "abort", "label": "planner abort", "group": "fault", "x": 540, "y": 220},
                {"id": "stop", "label": "e-brake / stop", "group": "outcome", "x": 540, "y": 340},
                {"id": "recover", "label": "clear_costmap", "group": "state", "x": 320, "y": 380},
                {"id": "percept", "label": "/perception/objects", "group": "node", "x": 110, "y": 340}
            ],
            "edges": [
                ["sensor", "dropout"],
                ["dropout", "costmap"],
                ["costmap", "planner"],
                ["planner", "abort"],
                ["abort", "stop"],
                ["costmap", "recover"],
                ["percept", "planner"],
                ["recover", "planner"]
            ]
        },
        "frames": [
            {"name": "base_link", "parent": "odom"},
            {"name": "laser_link", "parent": "base_link"},
            {"name": "imu_link", "parent": "base_link"}
        ],
        "replay": [
            {"t": 0.0, "pose": {"x": 0.0, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.5, "angular": 0.0}},
            {"t": 10.0, "pose": {"x": 5.0, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.5, "angular": 0.0}},
            {"t": 64.0, "pose": {"x": 32.0, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.5, "angular": 0.0}},
            {"t": 66.3, "pose": {"x": 33.1, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.0, "angular": 0.0}},
            {"t": 128.0, "pose": {"x": 33.1, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.0, "angular": 0.0}}
        ]
    },
    "nav_drift_failure.mcap": {
        "robot_name": "ARES-04",
        "ros_version": "ROS 2 Humble",
        "duration_seconds": 90.0,
        "total_messages": 18200,
        "topics": [
            {"name": "/sensors/imu", "hz": 100.0, "type": "sensor_msgs/Imu", "msgs": 9000},
            {"name": "/odom", "hz": 50.0, "type": "nav_msgs/Odometry", "msgs": 4500},
            {"name": "/cmd_vel", "hz": 20.0, "type": "geometry_msgs/Twist", "msgs": 1800},
            {"name": "/diagnostics", "hz": 1.0, "type": "diagnostic_msgs/DiagnosticArray", "msgs": 90}
        ],
        "timeline_events": [
            {"t": 10.0, "type": "log", "sev": "info", "topic": "/odom", "label": "Odometry active"},
            {"t": 35.5, "type": "anomaly", "sev": "warning", "topic": "/odom", "label": "Minor slippage detected"},
            {"t": 48.2, "type": "anomaly", "sev": "critical", "topic": "/odom", "label": "Critical odometry drift (exceeds 0.15m)"},
            {"t": 50.0, "type": "log", "sev": "critical", "topic": "/diagnostics", "label": "Wheel slippage threshold alarm"},
            {"t": 55.4, "type": "log", "sev": "critical", "topic": "/move_base", "label": "Navigation aborted: target unreachable"}
        ],
        "logs": [
            {"t": "00:00:10.000", "node": "/odom", "sev": "INFO", "text": "Odometry node initialized and active", "topic": "/odom"},
            {"t": "00:00:35.500", "node": "/odom", "sev": "WARN", "text": "Minor wheel slip detected on left drive assembly", "topic": "/odom"},
            {"t": "00:00:48.200", "node": "/odom", "sev": "ERROR", "text": "Transform odom to base_link drift exceeds tolerance (0.17m)", "topic": "/odom"},
            {"t": "00:00:50.000", "node": "/diagnostics", "sev": "ERROR", "text": "Hardware alert: Wheel odometry slip detected, tracking degraded", "topic": "/diagnostics"},
            {"t": "00:00:55.400", "node": "/move_base", "sev": "ERROR", "text": "Aborting goal: robot stuck or footprint collision", "topic": "/move_base"}
        ],
        "kgraph": {
            "nodes": [
                {"id": "odom", "label": "/odom node", "group": "node", "x": 100, "y": 100},
                {"id": "slip", "label": "wheel slip", "group": "fault", "x": 100, "y": 250},
                {"id": "drift", "label": "odom drift alert", "group": "state", "x": 300, "y": 180},
                {"id": "abort", "label": "navigation abort", "group": "outcome", "x": 500, "y": 180}
            ],
            "edges": [
                ["odom", "slip"],
                ["slip", "drift"],
                ["drift", "abort"]
            ]
        },
        "frames": [
            {"name": "base_link", "parent": "odom"}
        ],
        "replay": [
            {"t": 0.0, "pose": {"x": 0.0, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.3, "angular": 0.0}},
            {"t": 48.0, "pose": {"x": 14.4, "y": 0.2, "yaw": 0.05}, "cmd_vel": {"linear": 0.3, "angular": 0.0}},
            {"t": 55.4, "pose": {"x": 16.2, "y": 0.5, "yaw": 0.1}, "cmd_vel": {"linear": 0.0, "angular": 0.0}},
            {"t": 90.0, "pose": {"x": 16.2, "y": 0.5, "yaw": 0.1}, "cmd_vel": {"linear": 0.0, "angular": 0.0}}
        ]
    },
    "controller_abort.mcap": {
        "robot_name": "ARES-04",
        "ros_version": "ROS 2 Humble",
        "duration_seconds": 150.0,
        "total_messages": 22400,
        "topics": [
            {"name": "/scan", "hz": 10.0, "type": "sensor_msgs/LaserScan", "msgs": 1500},
            {"name": "/odom", "hz": 50.0, "type": "nav_msgs/Odometry", "msgs": 7500},
            {"name": "/cmd_vel", "hz": 20.0, "type": "geometry_msgs/Twist", "msgs": 3000},
            {"name": "/diagnostics", "hz": 1.0, "type": "diagnostic_msgs/DiagnosticArray", "msgs": 150}
        ],
        "timeline_events": [
            {"t": 15.0, "type": "log", "sev": "info", "topic": "/planner", "label": "Path active"},
            {"t": 82.5, "type": "anomaly", "sev": "warning", "topic": "/scan", "label": "Proximity warning: obstacle in front"},
            {"t": 85.0, "type": "log", "sev": "critical", "topic": "/move_base", "label": "Goal aborted: path blocked"},
            {"t": 86.2, "type": "log", "sev": "critical", "topic": "/diagnostics", "label": "Planner failure: Obstacle detected"}
        ],
        "logs": [
            {"t": "00:00:15.000", "node": "/planner", "sev": "INFO", "text": "Global path tracking started", "topic": "/planner"},
            {"t": "00:01:22.500", "node": "/scan", "sev": "WARN", "text": "Proximity threshold exceeded: obstacle detected at 0.38m", "topic": "/scan"},
            {"t": "00:01:25.000", "node": "/move_base", "sev": "ERROR", "text": "Aborting goal: obstacle detected on active path segment", "topic": "/move_base"},
            {"t": "00:01:26.200", "node": "/diagnostics", "sev": "ERROR", "text": "Diagnostics alert: Planner failure - Obstacle detected, path blocked", "topic": "/diagnostics"}
        ],
        "kgraph": {
            "nodes": [
                {"id": "scan", "label": "/scan sensor", "group": "sensor", "x": 100, "y": 100},
                {"id": "block", "label": "obstacle block", "group": "fault", "x": 300, "y": 100},
                {"id": "abort", "label": "controller abort", "group": "outcome", "x": 500, "y": 100}
            ],
            "edges": [
                ["scan", "block"],
                ["block", "abort"]
            ]
        },
        "frames": [
            {"name": "base_link", "parent": "odom"}
        ],
        "replay": [
            {"t": 0.0, "pose": {"x": 0.0, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.4, "angular": 0.0}},
            {"t": 82.5, "pose": {"x": 33.0, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.2, "angular": 0.0}},
            {"t": 85.0, "pose": {"x": 33.5, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.0, "angular": 0.0}},
            {"t": 150.0, "pose": {"x": 33.5, "y": 0.0, "yaw": 0.0}, "cmd_vel": {"linear": 0.0, "angular": 0.0}}
        ]
    }
}

def _seconds_from_log_t(t_str: str) -> float:
    """Parse 'HH:MM:SS.mmm' into seconds. Tolerates plain floats too."""
    try:
        parts = t_str.split(":")
        if len(parts) == 3:
            h, m, s = parts
            return float(h) * 3600 + float(m) * 60 + float(s)
    except Exception:
        pass
    try:
        return float(t_str)
    except Exception:
        return 0.0


def _derive_anomalies(timeline_events: List[Dict[str, Any]], logs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build AnomalyItem-shaped dicts from timeline entries marked type=='anomaly'.
    Each anomaly's `source_log_id` points at the log closest in time, which
    Neo4j later wires up as the `[:DERIVED_FROM]` target.

    Phase 5's AnomalyDetector worker will write richer anomalies with proper
    `kind` values ('dropout', 'outlier', 'signature'); for Phase 3 demo data
    we use the source topic as a proxy.
    """
    anomalies: List[Dict[str, Any]] = []
    # Pre-parse log timestamps once
    log_t_pairs = [(log.get("id"), _seconds_from_log_t(log.get("t", "0"))) for log in logs]

    anomaly_idx = 0
    for ev in timeline_events:
        if ev.get("type") != "anomaly":
            continue
        anomaly_idx += 1
        t = float(ev.get("t", 0.0))

        # Nearest log id by absolute timestamp delta
        nearest_log_id = None
        if log_t_pairs:
            nearest_log_id = min(log_t_pairs, key=lambda pair: abs(pair[1] - t))[0]

        anomalies.append({
            "id": f"a_{anomaly_idx}",
            "t": t,
            "kind": ev.get("topic", "unknown"),
            "severity": ev.get("sev", "info"),
            "source_log_id": nearest_log_id,
            "confidence": 1.0,
            "topic": ev.get("topic"),
            "label": ev.get("label"),
        })
    return anomalies


class IngestionParser:
    def __init__(self):
        self.tf_parser = TFParser()

    def parse_bag(self, filepath: str) -> Dict[str, Any]:
        """
        Parses a ROS bag file (.mcap or .db3).
        If the file matches a demo name or isn't a valid/existing bag,
        returns the corresponding high-fidelity mock dataset.
        """
        filename = os.path.basename(filepath)

        # Check if it's a demo bag file name
        if filename in DEMO_DATASETS:
            data = DEMO_DATASETS[filename].copy()
            # Set dynamic session/bag details
            data["session_id"] = str(uuid.uuid4())
            data["filename"] = filename
            data["filepath"] = filepath
            data["start_time"] = (datetime.now() - timedelta(seconds=data["duration_seconds"])).isoformat()
            data["end_time"] = datetime.now().isoformat()

            # Format logs to include unique IDs
            for idx, log in enumerate(data["logs"]):
                log["id"] = f"l_{idx + 1}"

            # Surface anomalies as a first-class field (Phase 3.§3.7 endpoint)
            data["anomalies"] = _derive_anomalies(data.get("timeline_events", []), data["logs"])
            return data
            
        # Resolve the path — translates host paths to Docker-mounted equivalents.
        resolved = _resolve_path(filepath)

        if os.path.exists(resolved):
            try:
                if resolved.endswith(".mcap"):
                    return self._parse_mcap(resolved)
                elif resolved.endswith(".db3"):
                    return self._parse_db3(resolved)
                else:
                    raise ValueError(f"Unsupported file extension: {resolved!r}")
            except Exception as exc:
                logger.error("Failed to parse bag %s: %s", resolved, exc, exc_info=True)
                raise  # surface the error → run_ingestion sets status='error'

        logger.error(
            "Bag file not found. original=%r  resolved=%r  HOST_MOUNT=%r",
            filepath, resolved, _HOST_MOUNT,
        )
        
        # Generic fallback for missing bags (expected by tests/demo runs without real data)
        return {
            "session_id": str(uuid.uuid4()),
            "filename": filename,
            "filepath": filepath,
            "robot_name": "GENERIC-ROBOT",
            "ros_version": "ROS 2 Humble",
            "duration_seconds": 0.0,
            "start_time": datetime.now().isoformat(),
            "end_time": datetime.now().isoformat(),
            "total_messages": 0,
            "topics": [],
            "timeline_events": [],
            "logs": [
                {
                    "id": "l_1",
                    "t": "00:00:00.000",
                    "node": "/system",
                    "sev": "INFO",
                    "text": f"Bag parsing fallback: file not found - {filepath}",
                    "topic": "/rosout"
                }
            ],
            "anomalies": [],
            "kgraph": {"nodes": [], "edges": []},
            "frames": [],
            "replay": []
        }

    def _parse_mcap(self, filepath: str) -> Dict[str, Any]:
        # Simple placeholder for real MCAP parser using `mcap` library
        # In a real environment, it extracts /rosout, /diagnostics, and /tf
        # For our purposes, we'll write a clean parser logic
        from mcap.reader import make_reader
        from mcap_ros2_support.reader import read_ros2_messages

        logs = []
        topics_dict = {}
        timeline_events = []
        start_time = None
        end_time = None

        with open(filepath, "rb") as f:
            reader = make_reader(f)
            # Build topic catalog from the MCAP summary.
            # summary.channels is dict[int, Channel]; summary.schemas is dict[int, Schema].
            summary = reader.get_summary()
            for channel in summary.channels.values():
                schema = summary.schemas.get(channel.schema_id)
                type_name = schema.name if schema else "unknown"
                topics_dict[channel.topic] = {
                    "name": channel.topic,
                    "hz": 0.0,  # computed below from real timestamps
                    "type": type_name,
                    "msgs": 0,
                }

        # Second pass: iterate decoded ROS 2 messages for /rosout and /tf only.
        # read_ros2_messages reopens the file internally.
        DECODE_TOPICS = {"/rosout", "/tf", "/tf_static"}
        sev_map = {10: "DEBUG", 20: "INFO", 30: "WARN", 40: "ERROR", 50: "FATAL"}

        for msg_info in read_ros2_messages(filepath):
            topic = msg_info.channel.topic
            timestamp = msg_info.log_time / 1e9  # nanoseconds → seconds

            if start_time is None:
                start_time = timestamp
            end_time = timestamp

            # Count every message regardless of topic
            if topic in topics_dict:
                topics_dict[topic]["msgs"] += 1

            # Only decode messages we actually need
            if topic not in DECODE_TOPICS:
                continue

            msg = msg_info.ros_msg

            if topic == "/rosout":
                node = getattr(msg, "name", "unknown")
                msg_text = getattr(msg, "msg", "")
                level_int = getattr(msg, "level", 20)
                sev = sev_map.get(level_int, "INFO")
                time_str = str(timedelta(seconds=timestamp - start_time))
                logs.append({
                    "id": f"l_{len(logs) + 1}",
                    "t": time_str,
                    "node": node,
                    "sev": sev,
                    "text": msg_text,
                    "topic": "/rosout",
                })
                if sev in ["WARN", "ERROR", "FATAL"]:
                    timeline_events.append({
                        "t": float(timestamp - start_time),
                        "type": "log",
                        "sev": sev.lower(),
                        "topic": topic,
                        "label": msg_text[:40],
                    })

            elif topic in ["/tf", "/tf_static"]:
                self.tf_parser.parse_tf_message(msg)

        dur = (end_time - start_time) if start_time and end_time else 0.0

        # Compute per-topic Hz from real message counts and bag duration.
        total_messages = 0
        for td in topics_dict.values():
            td["hz"] = round(td["msgs"] / dur, 2) if dur > 0 else 0.0
            total_messages += td["msgs"]

        return {
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
            "frames": self.tf_parser.get_frames_list(),
            "replay": []
        }

    def _parse_db3(self, filepath: str) -> Dict[str, Any]:
        # Fallback raw SQLite db3 reader using rosbags
        from rosbags.rosbag2 import Reader
        from rosbags.serde import deserialize_cdr

        logs = []
        topics_dict = {}
        start_time = None
        end_time = None

        DECODE_TOPICS = {"/rosout", "/tf", "/tf_static"}
        sev_map = {10: "DEBUG", 20: "INFO", 30: "WARN", 40: "ERROR", 50: "FATAL"}

        with Reader(filepath) as reader:
            # Pre-populate topic catalog from connection metadata so all topics
            # appear even if we don't decode every message.
            for connection in reader.connections:
                if connection.topic not in topics_dict:
                    topics_dict[connection.topic] = {
                        "name": connection.topic,
                        "hz": 0.0,  # computed below from real timestamps
                        "type": connection.msgtype,
                        "msgs": 0,
                    }

            for connection, timestamp, rawdata in reader.messages():
                topic = connection.topic
                t_sec = timestamp / 1e9

                if start_time is None:
                    start_time = t_sec
                end_time = t_sec

                topics_dict[topic]["msgs"] += 1

                # Only deserialize messages we actually need to analyse
                if topic not in DECODE_TOPICS:
                    continue

                try:
                    msg = deserialize_cdr(rawdata, connection.msgtype)
                except Exception:
                    continue

                if topic == "/rosout":
                    node = getattr(msg, "name", "unknown")
                    msg_text = getattr(msg, "msg", "")
                    level_int = getattr(msg, "level", 20)
                    sev = sev_map.get(level_int, "INFO")
                    logs.append({
                        "id": f"l_{len(logs) + 1}",
                        "t": str(timedelta(seconds=t_sec - start_time)),
                        "node": node,
                        "sev": sev,
                        "text": msg_text,
                        "topic": "/rosout",
                    })

                elif topic in ["/tf", "/tf_static"]:
                    self.tf_parser.parse_tf_message(msg)

        dur = (end_time - start_time) if start_time and end_time else 0.0

        # Compute per-topic Hz and total bag message count from real data.
        total_messages = 0
        for td in topics_dict.values():
            td["hz"] = round(td["msgs"] / dur, 2) if dur > 0 else 0.0
            total_messages += td["msgs"]

        return {
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
            "timeline_events": [],
            "logs": logs,
            "anomalies": [],
            "kgraph": {"nodes": [], "edges": []},
            "frames": self.tf_parser.get_frames_list(),
            "replay": []
        }

ingestion_parser = IngestionParser()
