import type {
  SessionMeta,
  TimelineEvent,
  TopicInfo,
  LogItem,
  KGraphData,
  ChatMessage,
} from "@shared/types";

export const MOCK_SESSION_META: SessionMeta = {
  id: "run-1042",
  filename: "robot-12_2026-05-22_142.bag",
  robot: "robot-12",
  durationSeconds: 872, // 14:32
  totalMessages: 312000,
  topicsCount: 10,
  status: "ready",
};

export const MOCK_TIMELINE_EVENTS: TimelineEvent[] = [
  {
    t: 12.4,
    type: "log",
    sev: "info",
    topic: "/move_base",
    label: "Goal received: bay_3_dock",
  },
  {
    t: 28.1,
    type: "log",
    sev: "info",
    topic: "/planner",
    label: "Global plan computed (47 waypoints)",
  },
  {
    t: 41.7,
    type: "sensor",
    sev: "info",
    topic: "/scan",
    label: "LiDAR scan stable, 12,840 pts/s",
  },
  {
    t: 58.3,
    type: "anomaly",
    sev: "warning",
    topic: "/perception/objects",
    label: "Pedestrian detection: 3 frame dropout",
  },
  {
    t: 64.2,
    type: "anomaly",
    sev: "critical",
    topic: "/sensors/lidar_a",
    label: "Sensor dropout (782 ms)",
  },
  {
    t: 65.0,
    type: "log",
    sev: "warning",
    topic: "/costmap",
    label: "Inflation radius applied: 0.45m → 0.85m",
  },
  {
    t: 65.4,
    type: "log",
    sev: "critical",
    topic: "/recovery",
    label: "Recovery behavior: clear_costmap triggered",
  },
  {
    t: 66.1,
    type: "log",
    sev: "critical",
    topic: "/move_base",
    label: "Planner aborted: no valid path",
  },
  {
    t: 66.3,
    type: "anomaly",
    sev: "critical",
    topic: "/cmd_vel",
    label: "Robot stopped (e-brake)",
  },
  {
    t: 72.8,
    type: "log",
    sev: "info",
    topic: "/diagnostics",
    label: "LiDAR back online, retrying",
  },
  {
    t: 81.5,
    type: "log",
    sev: "info",
    topic: "/move_base",
    label: "Plan re-attempt scheduled",
  },
  {
    t: 94.2,
    type: "log",
    sev: "warning",
    topic: "/perception/objects",
    label: "Confidence dropped to 0.58 (avg 0.91)",
  },
];

export const MOCK_TOPICS: TopicInfo[] = [
  { name: "/scan", hz: 10, type: "sensor_msgs/LaserScan", msgs: 1284 },
  {
    name: "/sensors/lidar_a",
    hz: 10,
    type: "sensor_msgs/PointCloud2",
    msgs: 1280,
  },
  { name: "/sensors/imu", hz: 100, type: "sensor_msgs/Imu", msgs: 12801 },
  { name: "/odom", hz: 50, type: "nav_msgs/Odometry", msgs: 6401 },
  { name: "/cmd_vel", hz: 20, type: "geometry_msgs/Twist", msgs: 2560 },
  { name: "/tf", hz: 100, type: "tf2_msgs/TFMessage", msgs: 12800 },
  {
    name: "/move_base/goal",
    hz: 0.1,
    type: "move_base_msgs/MoveBaseGoal",
    msgs: 4,
  },
  {
    name: "/perception/objects",
    hz: 15,
    type: "vision_msgs/Detection3DArray",
    msgs: 1920,
  },
  {
    name: "/costmap/inflated",
    hz: 5,
    type: "nav_msgs/OccupancyGrid",
    msgs: 640,
  },
  {
    name: "/diagnostics",
    hz: 1,
    type: "diagnostic_msgs/DiagnosticArray",
    msgs: 128,
  },
];

export const MOCK_LOGS: LogItem[] = [
  {
    t: "00:00:12.412",
    node: "/move_base",
    sev: "INFO",
    text: "Received new goal: bay_3_dock (x=24.3, y=-8.1, yaw=1.57)",
  },
  {
    t: "00:00:28.103",
    node: "/planner",
    sev: "INFO",
    text: "Global plan computed: 47 waypoints, cost 124.8, time 412ms",
  },
  {
    t: "00:00:41.701",
    node: "/scan",
    sev: "DEBUG",
    text: "LiDAR scan stable: 12840 pts/s, range 0.1-30.0m",
  },
  {
    t: "00:00:58.302",
    node: "/perception",
    sev: "WARN",
    text: "Pedestrian tracker: lost 3 frames on track_id=14 (occlusion?)",
  },
  {
    t: "00:01:04.215",
    node: "/sensors",
    sev: "ERROR",
    text: "Sensor dropout: /sensors/lidar_a no data for 782ms (threshold 250ms)",
  },
  {
    t: "00:01:05.001",
    node: "/costmap",
    sev: "WARN",
    text: "Costmap update stale; applying defensive inflation 0.45m → 0.85m",
  },
  {
    t: "00:01:05.412",
    node: "/recovery",
    sev: "ERROR",
    text: "Recovery behavior triggered: clear_costmap_recovery (attempt 1/3)",
  },
  {
    t: "00:01:06.118",
    node: "/move_base",
    sev: "ERROR",
    text: "Planner aborted — no valid path within tolerance after 2 retries",
  },
  {
    t: "00:01:06.310",
    node: "/cmd_vel",
    sev: "ERROR",
    text: "Velocity command zeroed; emergency brake engaged",
  },
  {
    t: "00:01:12.804",
    node: "/diagnostics",
    sev: "INFO",
    text: "LiDAR /sensors/lidar_a back online, latency 8ms, retrying plan",
  },
  {
    t: "00:01:21.502",
    node: "/move_base",
    sev: "INFO",
    text: "Replan scheduled at t+15s — operator confirmation required",
  },
  {
    t: "00:01:34.221",
    node: "/perception",
    sev: "WARN",
    text: "Detection confidence dropped to 0.58 (rolling avg 0.91) on object class=person",
  },
];

export const MOCK_KGRAPH: KGraphData = {
  nodes: [
    { id: "sensor", label: "/sensors/lidar_a", group: "sensor", x: 110, y: 70 },
    { id: "dropout", label: "sensor dropout", group: "fault", x: 110, y: 200 },
    {
      id: "costmap",
      label: "costmap inflation",
      group: "state",
      x: 320,
      y: 130,
    },
    {
      id: "planner",
      label: "/move_base planner",
      group: "node",
      x: 320,
      y: 280,
    },
    { id: "abort", label: "planner abort", group: "fault", x: 540, y: 220 },
    { id: "stop", label: "e-brake / stop", group: "outcome", x: 540, y: 340 },
    { id: "recover", label: "clear_costmap", group: "state", x: 320, y: 380 },
    {
      id: "percept",
      label: "/perception/objects",
      group: "node",
      x: 110,
      y: 340,
    },
  ],
  edges: [
    { source: "sensor", target: "dropout" },
    { source: "dropout", target: "costmap" },
    { source: "costmap", target: "planner" },
    { source: "planner", target: "abort" },
    { source: "abort", target: "stop" },
    { source: "costmap", target: "recover" },
    { source: "percept", target: "planner" },
    { source: "recover", target: "planner" },
  ],
};

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "sys-1",
    role: "system",
    text: "Session started · rosbag loaded · 14:32 PT",
  },
  {
    id: "msg-1",
    role: "assistant",
    time: "14:32",
    summary:
      "Loaded robot-12_2026-05-22_142.bag. 10 topics, 14:32 duration, 312 MB. Indexed semantic stream in 3.1s.",
  },
  {
    id: "msg-2",
    role: "user",
    text: "Why did robot-12 stop near loading bay 3?",
  },
  {
    id: "msg-3",
    role: "assistant",
    time: "14:33",
    summary:
      "Looked into the stop event at t=66.3s. Here's what I found and how I got there.",
    plan: [
      { label: "Locate stop event in /cmd_vel", done: true, active: false },
      {
        label: "Cross-reference /diagnostics + /sensors",
        done: true,
        active: false,
      },
      { label: "Trace planner decisions ±10s", done: true, active: false },
      { label: "Check costmap inflation history", done: true, active: false },
      { label: "Compare against baseline run-1024", done: false, active: true },
    ],
    findings: [
      {
        sev: "critical",
        text: "Sensor dropout on /sensors/lidar_a for 782 ms at t=64.2s",
        detail: "threshold 250 ms · 3.1× tolerance",
      },
      {
        sev: "critical",
        text: "Planner aborted at t=66.1s — no valid path within tolerance",
        detail: "/move_base · 2 retries",
      },
      {
        sev: "warning",
        text: "Costmap inflated defensively from 0.45 → 0.85 m",
        detail: "cascading effect, narrowed corridor",
      },
      {
        sev: "warning",
        text: "Pedestrian tracker lost 3 frames at t=58.3s",
        detail: "/perception/objects · same time window",
      },
    ],
    causal: [
      { text: "/sensors/lidar_a dropout (782 ms)" },
      { text: "/costmap defensive inflation (0.85 m)" },
      { text: "/move_base planner abort" },
      { text: "/cmd_vel emergency brake (stop)" },
    ],
    actions: [
      { iconName: "Clock", label: "Jump to timeline", target: "timeline" },
      { iconName: "Graph", label: "See causal graph", target: "kgraph" },
      {
        iconName: "Activity",
        label: "Metric: lidar latency",
        target: "metrics",
      },
    ],
  },
  {
    id: "sys-2",
    role: "system",
    text: "Comparing against baseline run-1024 — 4 more results pending",
  },
];
