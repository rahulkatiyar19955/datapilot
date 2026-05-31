"""Tests for build_kgraph — node enrichment (topics/sensors meta) and edges."""
from __future__ import annotations

from app.services.kgraph_builder import build_kgraph


SENSORS = [
    {"id": "s_1", "name": "lidar_a", "topic": "/sensors/lidar_a",
     "type": "LiDAR", "msg_type": "sensor_msgs/msg/LaserScan"},
]
TOPICS = [
    {"name": "/sensors/lidar_a", "type": "sensor_msgs/msg/LaserScan", "hz": 10.0, "msgs": 306},
    {"name": "/odom", "type": "nav_msgs/msg/Odometry", "hz": 50.0, "msgs": 1500},
]
ANOMALIES = [
    {"id": "a_1", "kind": "dropout", "severity": "critical", "topic": "/sensors/lidar_a"},
]
LOGS = [
    {"id": "l_1", "node": "/scan_node", "sev": "ERROR", "topic": "/sensors/lidar_a"},
]


def test_empty_inputs_yield_empty_graph():
    g = build_kgraph(sensors=[], anomalies=[], logs=[], causal_edges=[], topics=[])
    assert g == {"nodes": [], "edges": []}


def test_topic_nodes_carry_metadata():
    g = build_kgraph(sensors=[], anomalies=[], logs=[], causal_edges=[], topics=TOPICS)
    topic_nodes = {n["id"]: n for n in g["nodes"] if n["group"] == "topic"}
    assert "topic_/odom" in topic_nodes
    odom = topic_nodes["topic_/odom"]
    assert odom["meta"]["type"] == "nav_msgs/msg/Odometry"
    assert odom["meta"]["hz"] == 50.0
    assert odom["meta"]["msgs"] == 1500


def test_sensor_node_carries_sensor_type():
    g = build_kgraph(sensors=SENSORS, anomalies=[], logs=[], causal_edges=[], topics=[])
    sensor = next(n for n in g["nodes"] if n["group"] == "sensor")
    assert sensor["meta"]["sensorType"] == "LiDAR"
    assert sensor["meta"]["msgType"] == "sensor_msgs/msg/LaserScan"
    assert sensor["meta"]["topic"] == "/sensors/lidar_a"


def test_sensor_to_topic_edge():
    g = build_kgraph(sensors=SENSORS, anomalies=[], logs=[], causal_edges=[], topics=TOPICS)
    assert ["sensor_lidar_a", "topic_/sensors/lidar_a"] in g["edges"]


def test_sensor_to_ros_node_edge_by_topic():
    g = build_kgraph(sensors=SENSORS, anomalies=ANOMALIES, logs=LOGS, causal_edges=[], topics=TOPICS)
    node_ids = {n["id"] for n in g["nodes"]}
    assert "node_/scan_node" in node_ids
    assert ["sensor_lidar_a", "node_/scan_node"] in g["edges"]


def test_fault_and_outcome_nodes_have_severity():
    g = build_kgraph(sensors=[], anomalies=ANOMALIES, logs=[], causal_edges=[], topics=[])
    groups = {n["group"]: n for n in g["nodes"]}
    assert groups["fault"]["meta"]["kind"] == "dropout"
    assert groups["outcome"]["meta"]["severity"] == "critical"
