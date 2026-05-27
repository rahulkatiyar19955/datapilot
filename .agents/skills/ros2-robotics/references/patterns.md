# ROS2 Robotics

## Patterns

### **Node Structure**
  #### **Name**
ROS2 Node Architecture
  #### **Description**
Proper node structure with lifecycle management
  #### **When**
Creating a new ROS2 node
  #### **Pattern**
    #!/usr/bin/env python3
    import rclpy
    from rclpy.node import Node
    from rclpy.lifecycle import LifecycleNode, State, TransitionCallbackReturn
    from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
    from std_msgs.msg import String
    from sensor_msgs.msg import LaserScan
    from geometry_msgs.msg import Twist
    from typing import Optional
    import threading
    
    class RobotController(LifecycleNode):
        """
        Lifecycle-managed robot controller node.
    
        Lifecycle states: unconfigured -> inactive -> active -> finalized
        Transitions: configure, activate, deactivate, cleanup, shutdown
    
        Use lifecycle nodes for:
        - Controlled startup/shutdown sequences
        - Resource management
        - Coordinated system bringup
        """
    
        def __init__(self):
            super().__init__('robot_controller')
    
            # Declare parameters with defaults
            self.declare_parameter('max_speed', 1.0)
            self.declare_parameter('sensor_topic', '/scan')
            self.declare_parameter('cmd_topic', '/cmd_vel')
    
            # These will be created in on_configure
            self._laser_sub = None
            self._cmd_pub = None
            self._timer = None
    
            self.get_logger().info('Node created (unconfigured)')
    
        def on_configure(self, state: State) -> TransitionCallbackReturn:
            """Configure node resources."""
            try:
                # Get parameters
                self._max_speed = self.get_parameter('max_speed').value
                sensor_topic = self.get_parameter('sensor_topic').value
                cmd_topic = self.get_parameter('cmd_topic').value
    
                # Create QoS profile for sensors
                sensor_qos = QoSProfile(
                    reliability=ReliabilityPolicy.BEST_EFFORT,
                    history=HistoryPolicy.KEEP_LAST,
                    depth=10
                )
    
                # Create subscribers and publishers
                self._laser_sub = self.create_subscription(
                    LaserScan,
                    sensor_topic,
                    self._laser_callback,
                    sensor_qos
                )
    
                self._cmd_pub = self.create_publisher(
                    Twist,
                    cmd_topic,
                    10
                )
    
                self.get_logger().info('Configured successfully')
                return TransitionCallbackReturn.SUCCESS
    
            except Exception as e:
                self.get_logger().error(f'Configuration failed: {e}')
                return TransitionCallbackReturn.FAILURE
    
        def on_activate(self, state: State) -> TransitionCallbackReturn:
            """Activate node - start processing."""
            self._timer = self.create_timer(0.1, self._control_loop)
            self.get_logger().info('Activated')
            return TransitionCallbackReturn.SUCCESS
    
        def on_deactivate(self, state: State) -> TransitionCallbackReturn:
            """Deactivate node - stop processing."""
            if self._timer:
                self._timer.cancel()
                self._timer = None
            # Stop robot
            self._publish_stop()
            self.get_logger().info('Deactivated')
            return TransitionCallbackReturn.SUCCESS
    
        def on_cleanup(self, state: State) -> TransitionCallbackReturn:
            """Clean up resources."""
            self._laser_sub = None
            self._cmd_pub = None
            self.get_logger().info('Cleaned up')
            return TransitionCallbackReturn.SUCCESS
    
        def on_shutdown(self, state: State) -> TransitionCallbackReturn:
            """Final shutdown."""
            self._publish_stop()
            self.get_logger().info('Shutting down')
            return TransitionCallbackReturn.SUCCESS
    
        def _laser_callback(self, msg: LaserScan):
            """Process laser scan data."""
            self._latest_scan = msg
    
        def _control_loop(self):
            """Main control loop - called by timer."""
            # Implement control logic
            pass
    
        def _publish_stop(self):
            """Publish zero velocity to stop robot."""
            if self._cmd_pub:
                stop_cmd = Twist()
                self._cmd_pub.publish(stop_cmd)
    
    def main(args=None):
        rclpy.init(args=args)
        node = RobotController()
    
        # Use multi-threaded executor for callbacks
        executor = rclpy.executors.MultiThreadedExecutor()
        executor.add_node(node)
    
        try:
            executor.spin()
        except KeyboardInterrupt:
            pass
        finally:
            node.destroy_node()
            rclpy.shutdown()
    
    if __name__ == '__main__':
        main()
    
  #### **Why**
Lifecycle nodes provide controlled startup and resource management
### **Topic Service Action**
  #### **Name**
Communication Patterns
  #### **Description**
Topics, services, and actions for different use cases
  #### **Pattern**
    import rclpy
    from rclpy.node import Node
    from rclpy.action import ActionServer, ActionClient, GoalResponse, CancelResponse
    from rclpy.action.server import ServerGoalHandle
    from rclpy.callback_groups import ReentrantCallbackGroup, MutuallyExclusiveCallbackGroup
    
    from std_srvs.srv import SetBool
    from nav2_msgs.action import NavigateToPose
    
    """
    WHEN TO USE EACH:
    
    TOPICS (Publisher/Subscriber):
    - Continuous data streams
    - Sensor data, state, transforms
    - No response needed
    - Examples: /cmd_vel, /odom, /scan
    
    SERVICES (Request/Response):
    - Quick, one-shot operations
    - Configuration changes
    - Queries
    - Examples: /set_mode, /get_state
    
    ACTIONS (Long-running with feedback):
    - Tasks that take time
    - Preemptable operations
    - Need progress feedback
    - Examples: /navigate_to_pose, /follow_path
    """
    
    class CommunicationPatterns(Node):
    
        def __init__(self):
            super().__init__('comm_patterns')
    
            # Callback groups for parallel execution
            self._sensor_group = MutuallyExclusiveCallbackGroup()
            self._service_group = ReentrantCallbackGroup()
            self._action_group = ReentrantCallbackGroup()
    
            # Service server
            self._enable_service = self.create_service(
                SetBool,
                'enable_robot',
                self._enable_callback,
                callback_group=self._service_group
            )
    
            # Action server
            self._nav_action = ActionServer(
                self,
                NavigateToPose,
                'navigate_to_pose',
                execute_callback=self._navigate_execute,
                goal_callback=self._navigate_goal_callback,
                cancel_callback=self._navigate_cancel_callback,
                callback_group=self._action_group
            )
    
            # Action client
            self._nav_client = ActionClient(
                self,
                NavigateToPose,
                'navigate_to_pose'
            )
    
        def _enable_callback(self, request, response):
            """Service callback - quick operation."""
            if request.data:
                self._enabled = True
                response.success = True
                response.message = 'Robot enabled'
            else:
                self._enabled = False
                response.success = True
                response.message = 'Robot disabled'
            return response
    
        async def _navigate_execute(self, goal_handle: ServerGoalHandle):
            """Action execute callback - long-running task."""
            self.get_logger().info('Executing navigation goal')
    
            feedback = NavigateToPose.Feedback()
    
            while not self._goal_reached():
                # Check if canceled
                if goal_handle.is_cancel_requested:
                    goal_handle.canceled()
                    return NavigateToPose.Result()
    
                # Update feedback
                feedback.current_pose = self._get_current_pose()
                feedback.distance_remaining = self._distance_to_goal()
                goal_handle.publish_feedback(feedback)
    
                await asyncio.sleep(0.1)
    
            goal_handle.succeed()
            result = NavigateToPose.Result()
            return result
    
        def _navigate_goal_callback(self, goal_request):
            """Accept or reject goal."""
            if self._is_valid_goal(goal_request):
                return GoalResponse.ACCEPT
            return GoalResponse.REJECT
    
        def _navigate_cancel_callback(self, goal_handle):
            """Accept or reject cancel request."""
            return CancelResponse.ACCEPT
    
  #### **Why**
Choosing the right communication pattern prevents design problems
### **Launch System**
  #### **Name**
Launch File Best Practices
  #### **Description**
Python launch files for system bringup
  #### **Pattern**
    # launch/robot_bringup.launch.py
    from launch import LaunchDescription
    from launch.actions import (
        DeclareLaunchArgument,
        IncludeLaunchDescription,
        GroupAction,
        TimerAction,
        OpaqueFunction,
        LogInfo
    )
    from launch.launch_description_sources import PythonLaunchDescriptionSource
    from launch.substitutions import (
        LaunchConfiguration,
        PathJoinSubstitution,
        PythonExpression
    )
    from launch.conditions import IfCondition, UnlessCondition
    from launch_ros.actions import Node, LifecycleNode, PushRosNamespace
    from launch_ros.substitutions import FindPackageShare
    from ament_index_python.packages import get_package_share_directory
    import os
    
    def generate_launch_description():
        # Declare arguments
        use_sim = DeclareLaunchArgument(
            'use_sim',
            default_value='false',
            description='Use simulation instead of hardware'
        )
    
        robot_name = DeclareLaunchArgument(
            'robot_name',
            default_value='robot1',
            description='Unique robot name for namespacing'
        )
    
        config_file = DeclareLaunchArgument(
            'config_file',
            default_value=PathJoinSubstitution([
                FindPackageShare('my_robot'),
                'config',
                'params.yaml'
            ]),
            description='Path to configuration file'
        )
    
        # Get package paths
        pkg_share = get_package_share_directory('my_robot')
    
        # Define nodes
        robot_state_publisher = Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='robot_state_publisher',
            namespace=LaunchConfiguration('robot_name'),
            parameters=[{
                'robot_description': open(
                    os.path.join(pkg_share, 'urdf', 'robot.urdf')
                ).read()
            }],
            output='screen'
        )
    
        # Lifecycle node with automatic configuration
        controller_node = LifecycleNode(
            package='my_robot',
            executable='controller_node',
            name='controller',
            namespace=LaunchConfiguration('robot_name'),
            parameters=[LaunchConfiguration('config_file')],
            output='screen'
        )
    
        # Conditional node (only in simulation)
        sim_clock = Node(
            package='gazebo_ros',
            executable='gazebo',
            condition=IfCondition(LaunchConfiguration('use_sim')),
            output='screen'
        )
    
        # Hardware driver (only on real robot)
        hardware_driver = Node(
            package='my_robot_driver',
            executable='driver_node',
            condition=UnlessCondition(LaunchConfiguration('use_sim')),
            parameters=[LaunchConfiguration('config_file')],
            output='screen'
        )
    
        # Delayed start (wait for other nodes)
        delayed_planner = TimerAction(
            period=5.0,  # Wait 5 seconds
            actions=[
                Node(
                    package='nav2_planner',
                    executable='planner_server',
                    name='planner_server',
                    namespace=LaunchConfiguration('robot_name'),
                    parameters=[LaunchConfiguration('config_file')],
                    output='screen'
                )
            ]
        )
    
        # Include another launch file
        sensors_launch = IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                PathJoinSubstitution([
                    FindPackageShare('my_robot'),
                    'launch',
                    'sensors.launch.py'
                ])
            ]),
            launch_arguments={
                'robot_name': LaunchConfiguration('robot_name')
            }.items()
        )
    
        return LaunchDescription([
            use_sim,
            robot_name,
            config_file,
            robot_state_publisher,
            controller_node,
            sim_clock,
            hardware_driver,
            delayed_planner,
            sensors_launch
        ])
    
  #### **Why**
Proper launch files enable modular, configurable robot bringup
### **Qos Configuration**
  #### **Name**
QoS Configuration
  #### **Description**
Quality of Service settings for reliability
  #### **Critical**

  #### **Pattern**
    from rclpy.qos import (
        QoSProfile,
        QoSReliabilityPolicy,
        QoSHistoryPolicy,
        QoSDurabilityPolicy,
        QoSLivelinessPolicy
    )
    from rclpy.duration import Duration
    
    """
    QoS PROFILES FOR DIFFERENT USE CASES:
    
    SENSOR DATA:
    - Best effort reliability (drop if slow)
    - Keep last N messages
    - Volatile durability
    
    COMMANDS:
    - Reliable delivery (retry)
    - Keep last 1
    - Volatile durability
    
    PARAMETERS/CONFIG:
    - Reliable delivery
    - Transient local (late subscribers get last)
    - Keep last 1
    """
    
    # Sensor data (high frequency, tolerates drops)
    SENSOR_QOS = QoSProfile(
        reliability=QoSReliabilityPolicy.BEST_EFFORT,
        history=QoSHistoryPolicy.KEEP_LAST,
        depth=5,
        durability=QoSDurabilityPolicy.VOLATILE
    )
    
    # Commands (must arrive)
    COMMAND_QOS = QoSProfile(
        reliability=QoSReliabilityPolicy.RELIABLE,
        history=QoSHistoryPolicy.KEEP_LAST,
        depth=1,
        durability=QoSDurabilityPolicy.VOLATILE
    )
    
    # Parameters/state (late subscribers need last value)
    PARAMETER_QOS = QoSProfile(
        reliability=QoSReliabilityPolicy.RELIABLE,
        history=QoSHistoryPolicy.KEEP_LAST,
        depth=1,
        durability=QoSDurabilityPolicy.TRANSIENT_LOCAL
    )
    
    # Map data (large, infrequent)
    MAP_QOS = QoSProfile(
        reliability=QoSReliabilityPolicy.RELIABLE,
        history=QoSHistoryPolicy.KEEP_LAST,
        depth=1,
        durability=QoSDurabilityPolicy.TRANSIENT_LOCAL
    )
    
    # CRITICAL: QoS must match between publisher and subscriber
    # Mismatched QoS = silent connection failure!
    
    def check_qos_compatibility(pub_qos, sub_qos):
        """Check if publisher and subscriber QoS are compatible."""
        # Reliability: publisher must be >= subscriber
        if (sub_qos.reliability == QoSReliabilityPolicy.RELIABLE and
            pub_qos.reliability == QoSReliabilityPolicy.BEST_EFFORT):
            return False, "Reliability mismatch"
    
        # Durability: publisher must be >= subscriber
        if (sub_qos.durability == QoSDurabilityPolicy.TRANSIENT_LOCAL and
            pub_qos.durability == QoSDurabilityPolicy.VOLATILE):
            return False, "Durability mismatch"
    
        return True, "Compatible"
    
  #### **Why**
QoS mismatches cause silent communication failures
### **Transforms**
  #### **Name**
TF2 Transform Management
  #### **Description**
Coordinate frame transforms
  #### **Pattern**
    import rclpy
    from rclpy.node import Node
    from tf2_ros import TransformBroadcaster, StaticTransformBroadcaster
    from tf2_ros import TransformListener, Buffer
    from tf2_ros import TransformException
    from geometry_msgs.msg import TransformStamped
    import tf_transformations
    import numpy as np
    
    class TransformManager(Node):
        """
        TF2 Transform Best Practices:
    
        1. Use standard frame names (base_link, odom, map)
        2. Static transforms: Use static broadcaster
        3. Dynamic transforms: Publish at sensor rate
        4. Always check transform availability before use
        5. Use lookup_transform with timeout
        """
    
        def __init__(self):
            super().__init__('transform_manager')
    
            # Static broadcaster for fixed transforms
            self._static_broadcaster = StaticTransformBroadcaster(self)
    
            # Dynamic broadcaster for moving frames
            self._broadcaster = TransformBroadcaster(self)
    
            # Transform listener with buffer
            self._tf_buffer = Buffer()
            self._tf_listener = TransformListener(self._tf_buffer, self)
    
            # Publish static transforms once
            self._publish_static_transforms()
    
        def _publish_static_transforms(self):
            """Publish transforms that never change."""
            # Sensor mount offset
            t = TransformStamped()
            t.header.stamp = self.get_clock().now().to_msg()
            t.header.frame_id = 'base_link'
            t.child_frame_id = 'laser_link'
            t.transform.translation.x = 0.1
            t.transform.translation.y = 0.0
            t.transform.translation.z = 0.2
            t.transform.rotation.w = 1.0
    
            self._static_broadcaster.sendTransform(t)
    
        def publish_odom_transform(self, x, y, theta):
            """Publish odometry transform."""
            t = TransformStamped()
            t.header.stamp = self.get_clock().now().to_msg()
            t.header.frame_id = 'odom'
            t.child_frame_id = 'base_link'
    
            t.transform.translation.x = x
            t.transform.translation.y = y
            t.transform.translation.z = 0.0
    
            q = tf_transformations.quaternion_from_euler(0, 0, theta)
            t.transform.rotation.x = q[0]
            t.transform.rotation.y = q[1]
            t.transform.rotation.z = q[2]
            t.transform.rotation.w = q[3]
    
            self._broadcaster.sendTransform(t)
    
        def lookup_transform_safe(
            self,
            target_frame: str,
            source_frame: str,
            timeout_sec: float = 1.0
        ):
            """Safely look up transform with error handling."""
            try:
                transform = self._tf_buffer.lookup_transform(
                    target_frame,
                    source_frame,
                    rclpy.time.Time(),
                    timeout=rclpy.duration.Duration(seconds=timeout_sec)
                )
                return transform
            except TransformException as e:
                self.get_logger().warning(
                    f'Could not get transform {source_frame} -> {target_frame}: {e}'
                )
                return None
    
        def transform_point(self, point, source_frame, target_frame):
            """Transform a point between frames."""
            from geometry_msgs.msg import PointStamped
    
            point_stamped = PointStamped()
            point_stamped.header.frame_id = source_frame
            point_stamped.header.stamp = self.get_clock().now().to_msg()
            point_stamped.point = point
    
            try:
                transformed = self._tf_buffer.transform(
                    point_stamped,
                    target_frame
                )
                return transformed.point
            except TransformException as e:
                self.get_logger().error(f'Transform failed: {e}')
                return None
    
  #### **Why**
Proper TF management prevents coordinate frame errors

## Anti-Patterns

### **Topic Name Typo**
  #### **Name**
Typo in Topic Names
  #### **Problem**
Mistyped topic name causes silent failure - no error
  #### **Solution**
Use constants, remapping, and check with ros2 topic list
### **Blocking Callbacks**
  #### **Name**
Blocking in Callbacks
  #### **Problem**
Long operations in callback block executor
  #### **Solution**
Use async callbacks or separate threads
### **Qos Mismatch**
  #### **Name**
QoS Mismatch Between Publisher and Subscriber
  #### **Problem**
Incompatible QoS causes no connection, no error
  #### **Solution**
Check compatibility, use ros2 topic info --verbose