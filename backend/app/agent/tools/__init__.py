"""
Tool registry — one module per tool.

Each tool exposes:
  - `WORKER`: str (one of "rosbag_reader", "trajectory_analyzer",
    "planner_failure_inspector", "anomaly_detector", "report_composer")
  - `NAME`: tool name
  - `DESCRIPTION`: one-line summary used in tool catalogs
  - `INPUT_SCHEMA`: JSON Schema for arguments (strict, additionalProperties=false)
  - `OUTPUT_SCHEMA`: JSON Schema for the success result
  - `def run(args: dict) -> dict`: implementation returning `{ok, result|error}`

All tools are real Neo4j-backed implementations. No stubs.

Tool modules
------------
rosbag_reader:
  retrieve_logs, query_graph, query_mcap, read_tf_chain, read_diagnostics

trajectory_analyzer:
  query_topic, query_topic_rate

planner_failure_inspector:
  find_aborts, query_causal_chain, query_commands, query_recoveries,
  query_safety_rules

anomaly_detector:
  find_dropouts, find_statistical_outliers, find_signature_matches,
  compute_node_cpu, find_rate_regressions, compare_metric_distributions,
  compare_log_signatures

report_composer:
  format_causal_chain
"""
