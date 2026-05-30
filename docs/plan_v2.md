# Plan v2 — Debugging-Centric Rosbag Intelligence

> **Status:** Proposal. Not yet aligned with `docs/implementation.md`. Supersedes nothing until accepted.
> **Goal of this doc:** Define how DataPilot gives the user more value immediately after a rosbag is loaded: what changed, when it changed, why it matters, and what raw evidence proves it.

---

## 1. Problem & Motivation

Today ingestion creates useful session metadata, logs, diagnostics, TF frames, topics, sensors, anomalies, and causal log edges. That is enough for log-grounded answers, but it leaves most robotics debugging signal trapped inside unread high-frequency topics.

The production parsing path is:

1. `backend/app/api/sessions.py::run_ingestion`
2. `backend/app/services/parser.py::parse_bag`
3. the dedicated `mcap_parser` service, via `mcap_parser/parser.py`, when available
4. backend inline parser fallback when the parser service is unavailable

Both parser implementations currently decode only a narrow set of schema families: `/rosout` logs, `/tf`, and `/diagnostics`. Other topics such as `/odom`, `/cmd_vel`, LaserScan, IMU, point clouds, costmaps, perception output, and planner/controller state are mostly counted but not interpreted.

That means the app can say "navigation aborted" from logs, but often cannot answer the debugging questions robotics engineers actually ask next:

- Was the robot commanded to move but not moving?
- When did odometry drift start?
- Did the robot stop because commands went to zero or because motion failed?
- Did a topic rate collapse, gap, or burst happen before the failure?
- Did IMU acceleration or angular velocity corroborate a slip/drift event?
- Show me motion around 48 seconds.
- What changed immediately before navigation aborted?

Success is not "each message becomes graph data." Success is: the bag becomes a fast, grounded debugging workspace.

### Why Not One Graph Node Per Message

A real bag can contain millions of messages. Materializing every message as a Neo4j node would:

- destroy ingest latency and storage,
- make graph queries slower by bloating the graph,
- and add little debugging value compared with summaries, events, and bounded drill-down.

The graph should stay sparse and semantic. Raw values stay in the bag unless a bounded window is requested.

---

## 2. Target Architecture — Debug Signal Tiers

Keep the existing local-first rule: never send full raw bags or unbounded logs to an LLM. Retrieve concise, cited evidence first.

| Tier | Content | When | Storage | Purpose |
|---|---|---|---|---|
| **0 — Metadata** | session, topics, sensors, frames, hz, msg counts, time bounds | eager | Neo4j + SQLite session cache | orient the user and agents |
| **1 — Debugging evidence** | sparse anomalies, observations, motion-health events, topic-health timing events, summaries, correlations, existing logs/diagnostics/causal edges | eager | Neo4j for semantic evidence; SQLite for downsampled plot series | answer "what changed and why it matters" |
| **2 — Raw window** | exact decoded message values for a specific topic/time range | lazy | decoded from `.mcap`/`.db3` at query time | prove or inspect a finding |

**Tradeoff accepted:** raw drill-downs may touch the bag file at query time. For a local desktop app where the bag remains on disk, a bounded decode is better than storing raw message payloads in Neo4j.

---

## 3. First Slice — Motion + Topic Health

Build one vertical slice that users can feel immediately: motion debugging plus cheap timing analysis. Odometry alone is too narrow; the useful question is whether commanded motion, observed motion, IMU evidence, and topic timing agree.

### Inputs

Decode these eagerly in the primary `mcap_parser/parser.py` path, with fallback parity in `backend/app/services/parser.py`:

- `/odom` or topics with `nav_msgs/Odometry`
- `/cmd_vel` or topics with `geometry_msgs/Twist`
- IMU topics with `sensor_msgs/Imu`, limited to flat acceleration, angular velocity, and orientation fields
- topic timestamps for all topics, even when payloads are not decoded, to compute rate/gap/burst health
- optional planner/action context when present: goal, result, feedback, and status topics for common navigation stacks
- existing `/tf`, `/diagnostics`, and logs remain unchanged

### Derived Debug Signals

The Motion + Topic Health extractor should correlate command, odometry, IMU, and timing windows and emit sparse evidence for:

- **stuck:** non-zero command velocity, near-zero odom velocity for a sustained window
- **slip / command-actual mismatch:** commanded velocity and observed velocity diverge beyond threshold
- **drift:** position or yaw changes unexpectedly relative to commanded motion, TF context, or IMU orientation/angular velocity
- **sudden stop:** odom velocity drops sharply, with command context captured
- **excessive yaw drift:** yaw rate or yaw delta exceeds threshold during expected straight motion
- **topic rate drop:** observed publish rate falls materially below baseline for a sustained window
- **topic gap:** no messages arrive on an expected topic for longer than a computed or configured tolerance
- **topic burst:** publish rate spikes enough to suggest replay, queue, or producer instability
- **planner/action context:** navigation goal/result/status changes near the same window are attached as context, not treated as required inputs

These are not final universal definitions. They are v1 debug heuristics for a first slice and should be thresholded conservatively to avoid noisy findings.

Thresholds must be configurable per session or robot profile. Defaults should be derived from the loaded bag when possible: median/max odom velocity, median command velocity, median topic period, and observed IMU ranges. The first ingestion run should emit a **motion profile summary** so both humans and agents can reason about scale before trusting anomaly labels.

### Outputs

The extractor emits:

1. **Graph evidence:** reuse or extend the existing `Anomaly` model for v1 rather than introducing a parallel generic `Event` taxonomy.
2. **Stable evidence IDs:** every telemetry-derived item must have an `evidence_id` resolvable later.
3. **Timeline events:** user-visible markers for motion-health findings.
4. **Downsampled series:** plot-ready pose, odom velocity, command velocity, yaw, IMU acceleration/angular velocity, and topic rate data persisted locally.
5. **Optional log links:** when a relevant log exists near the same time, connect evidence to it with the existing `DERIVED_FROM` pattern.
6. **Motion profile summary:** per-session velocity/rate baselines and threshold values used by the extractor.

Do not require every telemetry finding to have a `log_id`. Some of the most valuable evidence is the absence of a log.

### Parser, Analyzer, and MCP Boundary

The parser owns cheap, deterministic extraction during ingestion:

- topic timestamps and metadata
- downsampled odom, cmd_vel, and IMU series
- motion profile summaries
- first-pass topic-health and motion-health evidence

The existing MCP workers remain the agent-facing analysis surface:

- `trajectory_analyzer` should query series and implement `read_topic_window(...)`
- `anomaly_detector` should query stored evidence and compare distributions/signatures
- `rosbag_reader` should continue to expose logs, diagnostics, TF, and raw bounded reads where appropriate

In other words: ingestion creates bounded evidence and series once; MCP tools retrieve, refine, compare, and drill down without reprocessing the entire bag on every chat turn.

---

## 4. Evidence, Citations, and Drill-Down

The current chat contract is log-centric: findings cite `log_ids`. Motion debugging needs telemetry citations too.

### Evidence Model

Use `evidence_id` as the canonical evidence key and keep `log_id` backward compatible:

- every existing `log_id` is also a valid evidence reference of type `log`
- telemetry-derived findings get an `evidence_id` of type `motion`, `topic_health`, `imu`, or another specific evidence type
- when a telemetry finding links to a nearby log, it may include both `evidence_id` and `log_id`

Composer and specialist outputs must not invent `log_ids` for telemetry-only findings. The frontend citation renderer should resolve evidence by ID and show a log citation, telemetry window, or both depending on evidence type.

### Drill-Down MCP Tool

Replace the vague `get_topic_window(topic, t_start, t_end)` idea with:

```text
read_topic_window(session_id, topic, t_from, t_to, fields?, sample_hz?, limit?)
```

Requirements:

- require `session_id`, `topic`, `t_from`, and `t_to`
- enforce a maximum time window and maximum returned rows
- support field projection so callers can ask for `pose.x`, `pose.y`, `twist.linear.x`, etc.
- support downsampling through `sample_hz`
- return stable evidence references for returned rows or windows
- return `{ok, result}` / `{ok: false, error}` using the existing MCP contract
- decode from the original bag path when raw values are needed, not from Neo4j

This tool should live under the trajectory/rosbag tooling boundary already exposed to specialists. The current `query_topic` name is misleading because it only reads logs; the new tool should make raw topic access explicit.

---

## 5. Local Series Store

Start with SQLite for downsampled series because it is already part of the local data model and is good enough for bounded plot data.

Add an explicit per-session series store instead of dumping ad hoc JSON into the session record. Store it under `DATAPILOT_DATA_DIR/sessions/<session_id>/series.sqlite` so session deletion can remove local artifacts by deleting the session directory after graph/checkpoint cleanup.

```text
topic_series(
  id,
  session_id,
  topic,
  t,
  fields_json,
  source_msg_type,
  evidence_id?
)
```

```text
topic_health(
  id,
  session_id,
  topic,
  t_start,
  t_end,
  expected_hz,
  observed_hz,
  gap_ms,
  severity,
  evidence_id
)
```

```text
motion_profile(
  session_id,
  summary_json,
  thresholds_json
)
```

Indexes:

- `(session_id, topic, t)`
- `(session_id, evidence_id)` when `evidence_id` is present
- `(session_id, topic, t_start, t_end)` for topic health windows

Deletion rule:

- deleting a session must delete its per-session series directory, graph evidence, logs, topics, sensors, diagnostics, and checkpoint rows.

Revisit parquet only if SQLite plotting latency or DB size becomes a real bottleneck.

---

## 6. Implementation Order

1. **Primary parser slice:** add Motion + Topic Health extraction to `mcap_parser/parser.py`.
2. **Fallback parity:** mirror the same supported fields in `backend/app/services/parser.py` so tests and degraded parser mode behave consistently.
3. **Series persistence:** add per-session SQLite series storage and session directory cleanup.
4. **Graph evidence:** write motion-health and topic-health findings as v1 telemetry evidence, preferably extending `Anomaly` rather than adding unrelated `Event` nodes.
5. **Citation support:** make `evidence_id` the canonical evidence key while keeping existing `log_id` citations working.
6. **Drill-down tool:** implement `read_topic_window(...)` with bounds, projection, downsampling, and MCP error envelopes.
7. **Worker integration:** expose Motion + Topic Health evidence through `trajectory_analyzer`, `anomaly_detector`, and `rosbag_reader` tools instead of adding one-off backend-only query paths.
8. **Specialist prompts/tools:** teach RootCauseAnalyst, PerformanceProfiler, ReplayNarrator, and AnomalyDetector to use motion/topic evidence and drill-down before speculating.
9. **UI surfacing:** show motion-health and topic-health markers on the timeline and plot downsampled pose/velocity/command velocity/IMU/topic-rate series in the metrics/replay area.

Do not build a full extractor registry before the first slice works. After Motion Health is useful, add a registry when the second or third extractor reveals the shared interface.

---

## 7. Acceptance Tests

Unit tests:

- synthetic odom/cmd_vel fixture produces stuck evidence
- synthetic command/actual mismatch produces slip evidence
- synthetic yaw drift produces yaw-drift evidence
- synthetic IMU spike corroborates a motion event without becoming a false root cause by itself
- synthetic topic timestamps produce rate-drop, gap, and burst evidence
- normal motion does not produce noisy critical findings
- thresholds are deterministic and documented in test names
- configurable thresholds override derived defaults

Tool tests:

- `read_topic_window` enforces required fields
- rejects unbounded or too-large windows
- applies `limit`
- applies `fields` projection
- applies `sample_hz` downsampling
- handles empty windows with `ok: true, result: []`
- returns structured `{ok: false, error}` on missing session, missing bag, unsupported topic, or decode failure

Integration tests:

- `nav_drift_failure.mcap` produces motion-health and topic-health evidence
- per-session series DB is created and deleted with the session
- graph evidence is queryable by session/topic/time
- chat can cite telemetry evidence without inventing `log_ids`
- existing `log_id` citations still render and resolve
- existing log/diagnostic/tf ingestion behavior remains unchanged

Manual acceptance:

- Load a bag and ask "Was the robot commanded to move but not moving?"
- Ask "When did odometry drift start?"
- Ask "Did any topic rate collapse before the failure?"
- Ask "Show me motion around 48 seconds."
- The answer includes timestamped evidence, an inspectable series/window, and no fake citations.

---

## 8. Explicit Non-Goals

- No one-node-per-message ingestion.
- No raw pointcloud/image payloads in Neo4j.
- No full extractor taxonomy designed up front.
- No requirement that telemetry findings always map to logs.
- No cloud upload or remote processing of raw bags.
- No broad LaserScan/perception/costmap payload support until Motion + Topic Health is useful end-to-end.
- No full planner-state reconstruction in the first slice; planner/action topics are optional context only.

---

## 9. Resolved Decisions

### 9.1 V1 Thresholds — Configurable per-session with sensible defaults

Hardcode conservative defaults for each detector (e.g. stuck = `cmd_vel > 0.05 m/s` but `odom < 0.01 m/s` for ≥3s). Allow per-session overrides via session settings or API.

The first ingestion run should also emit a **motion profile summary** (min/max/median velocities, dominant frequency) so the agent can self-calibrate relative to the robot's actual operating range. Exact default thresholds to be documented alongside the extractor implementation.

### 9.2 Evidence Naming — Extend existing `Anomaly` node

Add a `source` field to the existing `Anomaly` node: `"log"` for log-derived findings (current behavior) and `"telemetry"` for motion-health findings. Add an `evidence_id` property for telemetry-sourced anomalies.

This avoids a parallel node type, keeps all existing Cypher queries (`HAS_ANOMALY`), specialist prompts, and API endpoints (`/anomalies`) working without modification. The citation system will accept both `log_id` and `evidence_id`.

### 9.3 `read_topic_window` Limits — 30s max, 1000 rows max

- Maximum time window: **30 seconds**
- Maximum returned rows: **1000**
- Callers can further reduce via `sample_hz` and `limit` parameters

At 50Hz, 30s = 1500 raw messages before downsampling. Most debugging questions focus on 5–15 second windows; 30s covers the longest reasonable "show me what happened around X" request while keeping response payloads manageable for LLM context.

### 9.4 Raw Window Caching — No caching in v1

Decode from the bag file on every `read_topic_window` call. A bounded 30s decode of a single topic on local disk takes <200ms — not worth the complexity of a cache layer (invalidation, storage, lifecycle).

The SQLite series store already covers the *downsampled* data path for plots and timeline. Raw windows are by definition ad-hoc. Revisit caching only if profiling reveals a bottleneck.

### 9.5 Navigation Action Topics — ROS 2 Nav2 only

Recognize Nav2 action status topics in the first slice:
- `navigate_to_pose/_action/status`
- `follow_path/_action/status`

These correlate "robot stopped" with "navigation goal succeeded/failed/aborted." ROS 1 `move_base` support deferred until users request it — the parser is built around ROS 2 CDR decoding and the target audience is ROS 2 developers.

