// data.jsx — mock fixtures for the prototype

const ROBOTS = [
  { id: 'rb-12', name: 'robot-12', model: 'Atlas-K2', site: 'Loading Bay 3', status: 'critical', task: 'Pallet Move #4821', battery: 38, cpu: 71, uptime: '14h 22m', alerts: 3, env: 'Indoor' },
  { id: 'rb-07', name: 'robot-07', model: 'Atlas-K2', site: 'Aisle B-04',     status: 'warning',  task: 'Inventory Scan',  battery: 62, cpu: 44, uptime: '6h 11m',  alerts: 1, env: 'Indoor' },
  { id: 'rb-04', name: 'robot-04', model: 'Atlas-K1', site: 'Dock 2',         status: 'ok',       task: 'Idle / Charging', battery: 92, cpu: 12, uptime: '2d 4h',   alerts: 0, env: 'Indoor' },
  { id: 'rb-22', name: 'robot-22', model: 'Atlas-K2', site: 'Yard South',     status: 'ok',       task: 'Patrol Loop',     battery: 77, cpu: 31, uptime: '11h 03m', alerts: 0, env: 'Outdoor' },
  { id: 'rb-31', name: 'robot-31', model: 'Atlas-K3', site: 'Yard North',     status: 'warning',  task: 'Bin Transfer',    battery: 51, cpu: 58, uptime: '8h 47m',  alerts: 2, env: 'Outdoor / Rain' },
  { id: 'rb-09', name: 'robot-09', model: 'Atlas-K1', site: 'Dock 4',         status: 'ok',       task: 'Pallet Move',     battery: 84, cpu: 22, uptime: '19h 02m', alerts: 0, env: 'Indoor' },
  { id: 'rb-18', name: 'robot-18', model: 'Atlas-K2', site: 'Aisle A-12',     status: 'offline',  task: '— Offline —',     battery: 0,  cpu: 0,  uptime: '—',       alerts: 1, env: 'Indoor' },
  { id: 'rb-25', name: 'robot-25', model: 'Atlas-K3', site: 'Yard South',     status: 'ok',       task: 'Patrol Loop',     battery: 68, cpu: 27, uptime: '4h 56m',  alerts: 0, env: 'Outdoor' },
  { id: 'rb-14', name: 'robot-14', model: 'Atlas-K2', site: 'Loading Bay 1',  status: 'ok',       task: 'Pallet Move',     battery: 79, cpu: 35, uptime: '1d 2h',   alerts: 0, env: 'Indoor' },
  { id: 'rb-03', name: 'robot-03', model: 'Atlas-K1', site: 'Dock 1',         status: 'warning',  task: 'Inventory Scan',  battery: 41, cpu: 49, uptime: '7h 19m',  alerts: 1, env: 'Indoor' },
  { id: 'rb-28', name: 'robot-28', model: 'Atlas-K3', site: 'Yard North',     status: 'ok',       task: 'Bin Transfer',    battery: 88, cpu: 19, uptime: '12h 34m', alerts: 0, env: 'Outdoor' },
  { id: 'rb-16', name: 'robot-16', model: 'Atlas-K2', site: 'Aisle C-07',     status: 'ok',       task: 'Idle',            battery: 100,cpu: 8,  uptime: '3d 0h',   alerts: 0, env: 'Indoor' },
];

const TIMELINE_EVENTS = [
  { t: 12.4,  type: 'log',     sev: 'info',    topic: '/move_base',          label: 'Goal received: bay_3_dock' },
  { t: 28.1,  type: 'log',     sev: 'info',    topic: '/planner',            label: 'Global plan computed (47 waypoints)' },
  { t: 41.7,  type: 'sensor',  sev: 'info',    topic: '/scan',               label: 'LiDAR scan stable, 12,840 pts/s' },
  { t: 58.3,  type: 'anomaly', sev: 'warning', topic: '/perception/objects', label: 'Pedestrian detection: 3 frame dropout' },
  { t: 64.2,  type: 'anomaly', sev: 'critical',topic: '/sensors/lidar_a',    label: 'Sensor dropout (782 ms)' },
  { t: 65.0,  type: 'log',     sev: 'warning', topic: '/costmap',            label: 'Inflation radius applied: 0.45m → 0.85m' },
  { t: 65.4,  type: 'log',     sev: 'critical',topic: '/recovery',           label: 'Recovery behavior: clear_costmap triggered' },
  { t: 66.1,  type: 'log',     sev: 'critical',topic: '/move_base',          label: 'Planner aborted: no valid path' },
  { t: 66.3,  type: 'anomaly', sev: 'critical',topic: '/cmd_vel',            label: 'Robot stopped (e-brake)' },
  { t: 72.8,  type: 'log',     sev: 'info',    topic: '/diagnostics',        label: 'LiDAR back online, retrying' },
  { t: 81.5,  type: 'log',     sev: 'info',    topic: '/move_base',          label: 'Plan re-attempt scheduled' },
  { t: 94.2,  type: 'log',     sev: 'warning', topic: '/perception/objects', label: 'Confidence dropped to 0.58 (avg 0.91)' },
];

const TOPICS = [
  { name: '/scan',                hz: 10,  type: 'sensor_msgs/LaserScan',           msgs: 1284 },
  { name: '/sensors/lidar_a',     hz: 10,  type: 'sensor_msgs/PointCloud2',         msgs: 1280 },
  { name: '/sensors/imu',         hz: 100, type: 'sensor_msgs/Imu',                 msgs: 12801 },
  { name: '/odom',                hz: 50,  type: 'nav_msgs/Odometry',               msgs: 6401 },
  { name: '/cmd_vel',             hz: 20,  type: 'geometry_msgs/Twist',             msgs: 2560 },
  { name: '/tf',                  hz: 100, type: 'tf2_msgs/TFMessage',              msgs: 12800 },
  { name: '/move_base/goal',      hz: 0.1, type: 'move_base_msgs/MoveBaseGoal',     msgs: 4 },
  { name: '/perception/objects',  hz: 15,  type: 'vision_msgs/Detection3DArray',    msgs: 1920 },
  { name: '/costmap/inflated',    hz: 5,   type: 'nav_msgs/OccupancyGrid',          msgs: 640 },
  { name: '/diagnostics',         hz: 1,   type: 'diagnostic_msgs/DiagnosticArray', msgs: 128 },
];

const LOGS = [
  { t: '00:00:12.412', node: '/move_base',  sev: 'INFO',  text: 'Received new goal: bay_3_dock (x=24.3, y=-8.1, yaw=1.57)' },
  { t: '00:00:28.103', node: '/planner',    sev: 'INFO',  text: 'Global plan computed: 47 waypoints, cost 124.8, time 412ms' },
  { t: '00:00:41.701', node: '/scan',       sev: 'DEBUG', text: 'LiDAR scan stable: 12840 pts/s, range 0.1-30.0m' },
  { t: '00:00:58.302', node: '/perception', sev: 'WARN',  text: 'Pedestrian tracker: lost 3 frames on track_id=14 (occlusion?)' },
  { t: '00:01:04.215', node: '/sensors',    sev: 'ERROR', text: 'Sensor dropout: /sensors/lidar_a no data for 782ms (threshold 250ms)' },
  { t: '00:01:05.001', node: '/costmap',    sev: 'WARN',  text: 'Costmap update stale; applying defensive inflation 0.45m → 0.85m' },
  { t: '00:01:05.412', node: '/recovery',   sev: 'ERROR', text: 'Recovery behavior triggered: clear_costmap_recovery (attempt 1/3)' },
  { t: '00:01:06.118', node: '/move_base',  sev: 'ERROR', text: 'Planner aborted — no valid path within tolerance after 2 retries' },
  { t: '00:01:06.310', node: '/cmd_vel',    sev: 'ERROR', text: 'Velocity command zeroed; emergency brake engaged' },
  { t: '00:01:12.804', node: '/diagnostics',sev: 'INFO',  text: 'LiDAR /sensors/lidar_a back online, latency 8ms, retrying plan' },
  { t: '00:01:21.502', node: '/move_base',  sev: 'INFO',  text: 'Replan scheduled at t+15s — operator confirmation required' },
  { t: '00:01:34.221', node: '/perception', sev: 'WARN',  text: 'Detection confidence dropped to 0.58 (rolling avg 0.91) on object class=person' },
];

const PAST_RUNS = [
  { id: 'run-1042', robot: 'robot-12', date: '2026-05-22', dur: '00:14:32', env: 'Indoor',          anomalies: 3, tags: ['planner-abort', 'lidar-dropout'], title: 'Loading Bay 3 — pallet drop emergency stop' },
  { id: 'run-1038', robot: 'robot-07', date: '2026-05-21', dur: '00:08:11', env: 'Outdoor / Rain',  anomalies: 5, tags: ['perception-fail', 'rain'],         title: 'Yard patrol — pedestrian detection failure in rain' },
  { id: 'run-1029', robot: 'robot-31', date: '2026-05-19', dur: '00:22:04', env: 'Outdoor',         anomalies: 2, tags: ['localization'],                    title: 'Bin transfer — localization drift on slope' },
  { id: 'run-1024', robot: 'robot-04', date: '2026-05-18', dur: '00:31:50', env: 'Indoor',          anomalies: 0, tags: ['nominal'],                         title: 'Nominal pallet move — baseline reference run' },
  { id: 'run-1019', robot: 'robot-12', date: '2026-05-15', dur: '00:11:08', env: 'Indoor',          anomalies: 4, tags: ['costmap', 'recovery'],            title: 'Aisle B-04 — costmap inflation cascade' },
  { id: 'run-1015', robot: 'robot-22', date: '2026-05-14', dur: '00:17:33', env: 'Outdoor / Fog',   anomalies: 6, tags: ['perception-fail', 'fog'],          title: 'Yard South — perception degraded by dense fog' },
];

const KGRAPH = {
  nodes: [
    { id: 'sensor',   label: '/sensors/lidar_a',       group: 'sensor',  x: 110, y: 70 },
    { id: 'dropout',  label: 'sensor dropout',         group: 'fault',   x: 110, y: 200 },
    { id: 'costmap',  label: 'costmap inflation',      group: 'state',   x: 320, y: 130 },
    { id: 'planner',  label: '/move_base planner',     group: 'node',    x: 320, y: 280 },
    { id: 'abort',    label: 'planner abort',          group: 'fault',   x: 540, y: 220 },
    { id: 'stop',     label: 'e-brake / stop',         group: 'outcome', x: 540, y: 340 },
    { id: 'recover',  label: 'clear_costmap',          group: 'state',   x: 320, y: 380 },
    { id: 'percept',  label: '/perception/objects',    group: 'node',    x: 110, y: 340 },
  ],
  edges: [
    ['sensor','dropout'],
    ['dropout','costmap'],
    ['costmap','planner'],
    ['planner','abort'],
    ['abort','stop'],
    ['costmap','recover'],
    ['percept','planner'],
    ['recover','planner'],
  ],
};

window.DP = { ROBOTS, TIMELINE_EVENTS, TOPICS, LOGS, PAST_RUNS, KGRAPH };
