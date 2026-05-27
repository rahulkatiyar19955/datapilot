import pytest
from app.services.causal_rules import causal_rules_evaluator

def test_causal_evaluator_loading():
    # Verify that rules are loaded from causal.yaml
    assert len(causal_rules_evaluator.rules) > 0
    rule_ids = [r["id"] for r in causal_rules_evaluator.rules]
    assert "sensor_dropout_inflates_costmap" in rule_ids
    assert "costmap_inflation_aborts_planner" in rule_ids

def test_causal_evaluation():
    # Mock logs to match causal rules
    logs = [
        # Cause: sensor dropout
        {"id": "l_1", "t": "00:00:10.000", "node": "/sensors/lidar_a", "sev": "ERROR", "text": "Sensor dropout: no data for 782ms"},
        # Effect: costmap inflation (within 2s)
        {"id": "l_2", "t": "00:00:11.500", "node": "/costmap", "sev": "WARN", "text": "applying defensive inflation 0.45m → 0.85m"},
        # Unrelated log
        {"id": "l_3", "t": "00:00:20.000", "node": "/odom", "sev": "INFO", "text": "Odometry stable"}
    ]
    
    edges = causal_rules_evaluator.evaluate(logs)
    
    # Filter for CAUSED/TRIGGERED type edges
    causal_edges = [e for e in edges if e["type"] != "CONCURRENT_WITH"]
    assert len(causal_edges) == 1
    edge = causal_edges[0]
    assert edge["source_id"] == "l_1"
    assert edge["target_id"] == "l_2"
    assert edge["type"] == "TRIGGERED"
    assert edge["properties"]["rule_id"] == "sensor_dropout_inflates_costmap"
    assert edge["properties"]["lag_ms"] == 1500

def test_concurrency_edges():
    logs = [
        {"id": "l_1", "t": "00:00:10.000", "node": "/node_a", "sev": "INFO", "text": "Log A"},
        {"id": "l_2", "t": "00:00:10.030", "node": "/node_b", "sev": "INFO", "text": "Log B"}  # 30ms difference (<=50ms)
    ]
    
    edges = causal_rules_evaluator.evaluate(logs)
    concurrent_edges = [e for e in edges if e["type"] == "CONCURRENT_WITH"]
    assert len(concurrent_edges) == 1
    assert concurrent_edges[0]["source_id"] == "l_1"
    assert concurrent_edges[0]["target_id"] == "l_2"
    assert concurrent_edges[0]["properties"]["lag_ms"] == 30
