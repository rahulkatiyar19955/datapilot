# MCP Workers

Five containerized MCP servers exposing tools to the agent layer.
See `docs/implementation.md` §5 for per-worker tool specs.

| Worker | Phase | Tools (planned) |
| :--- | :--- | :--- |
| `rosbag_reader` | 5 | extract_topic_schemas, read_diagnostics, read_tf_chain |
| `trajectory_analyzer` | 5 | compute_velocities, compute_goal_deviation, query_topic |
| `planner_failure_inspector` | 5 | inspect_planner_state, find_aborts, query_causal_chain |
| `anomaly_detector` | 5 | find_dropouts, find_statistical_outliers, find_signature_matches |
| `report_composer` | 5 | format_causal_chain, compose_findings_card, compose_recommendations |

Phase 0 ships placeholder `server.py` + `Dockerfile` for each worker so
`docker compose config` validates. Real tools land in Phase 5.
