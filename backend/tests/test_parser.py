import pytest
from app.services.parser import ingestion_parser

def test_demo_bag_selection():
    # Verify parsing lidar_failure.mcap
    res = ingestion_parser.parse_bag("lidar_failure.mcap")
    assert res["robot_name"] == "ARES-04"
    assert res["ros_version"] == "ROS 2 Humble"
    assert len(res["logs"]) == 12
    assert len(res["topics"]) == 10
    
    # Check log IDs formatting
    assert res["logs"][0]["id"] == "l_1"
    assert res["logs"][-1]["id"] == "l_12"
    
    # Check timeline events mapping
    assert len(res["timeline_events"]) == 12
    assert res["timeline_events"][4]["sev"] == "critical"

def test_generic_fallback():
    # Verify parsing some arbitrary non-existent file
    res = ingestion_parser.parse_bag("arbitrary_missing_file.mcap")
    assert res["robot_name"] == "GENERIC-ROBOT"
    assert len(res["logs"]) == 1
    assert res["logs"][0]["id"] == "l_1"
    assert res["logs"][0]["sev"] == "INFO"
