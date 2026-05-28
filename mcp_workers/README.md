# MCP Workers

Five containerized MCP servers exposing tools to the agent layer.
See `docs/implementation.md` §5 for per-worker tool specs.

| Worker | Port | Tools |
| :--- | :--- | :--- |
| `rosbag_reader` | 9001 | retrieve_logs, read_tf_chain, read_diagnostics |
| `trajectory_analyzer` | 9002 | query_topic, query_topic_rate |
| `planner_failure_inspector` | 9003 | find_aborts, query_causal_chain, query_commands, query_recoveries, query_safety_rules |
| `anomaly_detector` | 9004 | find_dropouts, find_statistical_outliers, find_signature_matches, compute_node_cpu, find_rate_regressions, compare_metric_distributions, compare_log_signatures |
| `report_composer` | 9005 | format_causal_chain |

All tools are real Neo4j-backed implementations. The Electron orchestrator
starts all five workers alongside neo4j and the backend. Tool execution uses
`DATAPILOT_MCP_TRANSPORT=in_process` — calls `module.run()` directly without
subprocess overhead; the worker containers stay running for the `/health`
endpoint polled by the Agents & MCP status screen.
