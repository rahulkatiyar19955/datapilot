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

In Phase 4 every `run` is an in-process Python function. Phase 5 swaps these
out for JSON-RPC calls to the actual MCP worker containers — the registry shape
stays identical.
"""
