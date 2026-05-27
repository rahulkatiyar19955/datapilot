# Ros2 Robotics - Sharp Edges

## Topic Name Typo Causes Silent Failure

### **Id**
topic-name-typo
### **Severity**
critical
### **Summary**
Mistyped topic name creates no connection and no error
### **Symptoms**
  - Publisher publishes but subscriber receives nothing
  - Node appears to work but no data flows
  - ros2 topic list shows separate topics
### **Why**
  ROS2 doesn't validate topic names at compile or launch time.
  If you type '/odom' in one place and '\odom' in another,
  you get two separate topics with no warning.
  
  Common typos:
  - Missing leading slash: 'cmd_vel' vs '/cmd_vel'
  - Underscore vs no underscore: 'laser_scan' vs 'laserscan'
  - Namespace issues: '/robot1/cmd_vel' vs '/cmd_vel'
  
  This is the #1 debugging issue for ROS beginners.
  
### **Gotcha**
  # Publisher uses one name
  self.pub = self.create_publisher(Twist, '/cmd_vel', 10)
  
  # Subscriber has typo (no error!)
  self.sub = self.create_subscription(Twist, 'cmd_vel', callback, 10)
  # Missing leading '/' - creates separate topic!
  
  # Both nodes run fine, but no data flows
  
### **Solution**
  # Use constants for topic names
  class Topics:
      CMD_VEL = '/cmd_vel'
      ODOM = '/odom'
      SCAN = '/scan'
  
  self.pub = self.create_publisher(Twist, Topics.CMD_VEL, 10)
  self.sub = self.create_subscription(Twist, Topics.CMD_VEL, callback, 10)
  
  # Use remapping in launch files for flexibility
  # Verify with: ros2 topic list
  # Check connections: ros2 topic info /topic_name --verbose
  

## QoS Mismatch Causes Silent Connection Failure

### **Id**
qos-mismatch
### **Severity**
critical
### **Summary**
Publisher and subscriber QoS incompatibility prevents connection
### **Symptoms**
  - ros2 topic list shows topic exists
  - ros2 topic info shows both pub and sub
  - No data flows, no error messages
### **Why**
  ROS2 enforces QoS compatibility at connection time.
  If publisher offers less than subscriber requires, no connection.
  
  Most common mismatch:
  - Publisher: BEST_EFFORT (sensor default)
  - Subscriber: RELIABLE (default for many packages)
  
  Result: Silent failure, no error message.
  
### **Gotcha**
  # Sensor driver publishes with BEST_EFFORT
  sensor_qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT, ...)
  self.pub = self.create_publisher(LaserScan, '/scan', sensor_qos)
  
  # Your node subscribes with default (RELIABLE)
  self.sub = self.create_subscription(LaserScan, '/scan', callback, 10)
  # Connection fails silently!
  
### **Solution**
  # Check QoS with verbose info
  # ros2 topic info /scan --verbose
  
  # Match publisher's QoS
  from rclpy.qos import qos_profile_sensor_data
  self.sub = self.create_subscription(
      LaserScan, '/scan', callback,
      qos_profile_sensor_data  # Matches sensor publishers
  )
  
  # Or explicitly set compatible QoS
  sensor_qos = QoSProfile(
      reliability=ReliabilityPolicy.BEST_EFFORT,
      history=HistoryPolicy.KEEP_LAST,
      depth=10
  )
  

## Blocking Operations in Callbacks

### **Id**
blocking-callback
### **Severity**
high
### **Summary**
Long operations block all other callbacks
### **Symptoms**
  - Timer callbacks become irregular
  - Subscribers stop receiving messages
  - Node becomes unresponsive
### **Why**
  ROS2 executors are single-threaded by default.
  If one callback takes 1 second, ALL other callbacks wait.
  
  This means:
  - 100Hz control loop becomes 1Hz
  - Watchdogs trigger
  - Robot stops responding
  
### **Gotcha**
  def callback(self, msg):
      # This blocks the entire executor
      result = self.expensive_computation(msg)  # Takes 500ms
      # All other callbacks wait
  
  def timer_callback(self):
      # Expected: 100Hz
      # Actual: Whenever expensive_computation finishes
      self.publish_command()
  
### **Solution**
  # Option 1: Use MultiThreadedExecutor
  executor = MultiThreadedExecutor(num_threads=4)
  
  # With separate callback groups
  from rclpy.callback_groups import MutuallyExclusiveCallbackGroup
  
  self._sensor_group = MutuallyExclusiveCallbackGroup()
  self._compute_group = MutuallyExclusiveCallbackGroup()
  
  self.sub = self.create_subscription(
      ..., callback_group=self._sensor_group
  )
  self.timer = self.create_timer(
      0.01, self.control_callback,
      callback_group=self._compute_group
  )
  
  # Option 2: Async callbacks (ROS2 Humble+)
  async def callback(self, msg):
      result = await asyncio.to_thread(self.expensive_computation, msg)
  

## Transform Lookup Without Timeout

### **Id**
tf-timeout
### **Severity**
high
### **Summary**
Missing TF transform blocks forever
### **Symptoms**
  - Node hangs waiting for transform
  - No error until Ctrl+C
  - Works sometimes, hangs other times
### **Why**
  lookup_transform with default timeout blocks forever if
  the transform doesn't exist. This can happen:
  - During startup (TF not published yet)
  - If publishing node dies
  - If frame name is wrong
  
  No error is raised until you interrupt.
  
### **Gotcha**
  # This blocks forever if transform doesn't exist
  transform = self.tf_buffer.lookup_transform(
      'map', 'base_link',
      rclpy.time.Time()  # Now
  )
  
### **Solution**
  # Always use timeout
  try:
      transform = self.tf_buffer.lookup_transform(
          'map', 'base_link',
          rclpy.time.Time(),
          timeout=rclpy.duration.Duration(seconds=1.0)
      )
  except TransformException as e:
      self.get_logger().warning(f'Transform failed: {e}')
      return  # Handle gracefully
  
  # Check if transform exists before lookup
  if self.tf_buffer.can_transform('map', 'base_link', rclpy.time.Time()):
      transform = self.tf_buffer.lookup_transform(...)
  

## Using Parameters Without Declaration

### **Id**
parameter-not-declared
### **Severity**
medium
### **Summary**
get_parameter fails if parameter not declared first
### **Symptoms**
  - ParameterNotDeclaredException on startup
  - Works in some nodes, fails in others
  - Parameter files seem ignored
### **Why**
  ROS2 requires parameters to be declared before use.
  This is different from ROS1's dynamic parameters.
  
  If you try to get an undeclared parameter, you get
  an exception, not a default value.
  
### **Gotcha**
  # ROS1 style (doesn't work in ROS2)
  speed = self.get_parameter('max_speed').value
  # Throws: ParameterNotDeclaredException
  
  # Even if max_speed is in your YAML file!
  
### **Solution**
  # Declare parameter first
  self.declare_parameter('max_speed', 1.0)  # With default
  speed = self.get_parameter('max_speed').value
  
  # Or declare without default (requires YAML)
  self.declare_parameter('max_speed')
  
  # Bulk declaration
  self.declare_parameters('', [
      ('max_speed', 1.0),
      ('min_speed', 0.1),
      ('topic_name', '/cmd_vel')
  ])
  

## Transform Lookup at Time Zero

### **Id**
time-zero-transform
### **Severity**
high
### **Summary**
Requesting latest transform can get stale data
### **Symptoms**
  - Transform is slightly behind
  - Sensor data doesn't align with transform
  - Inconsistent behavior with sim vs real
### **Why**
  Time(0) means "give me the latest available transform."
  But if you're processing a sensor message from 100ms ago,
  the latest TF might be 100ms newer than your data.
  
  This causes sensor data to be in the wrong place.
  
### **Solution**
  # Use message timestamp for transform lookup
  def sensor_callback(self, msg):
      try:
          # Use sensor message timestamp
          transform = self.tf_buffer.lookup_transform(
              'map',
              msg.header.frame_id,
              msg.header.stamp,  # Sensor timestamp, not Time(0)
              timeout=Duration(seconds=0.1)
          )
      except TransformException as e:
          self.get_logger().warning(f'TF lookup failed: {e}')
  