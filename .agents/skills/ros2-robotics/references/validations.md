# Ros2 Robotics - Validations

## Parameter Usage Without Declaration

### **Id**
undeclared-parameter
### **Severity**
warning
### **Type**
regex
### **Pattern**
  - get_parameter\(['"][^'"]+['"]\)(?![\s\S]{0,200}declare_parameter)
### **Message**
Declare parameters before using them to avoid ParameterNotDeclaredException.
### **Fix Action**
Add self.declare_parameter('name', default_value) in __init__
### **Applies To**
  - **/*.py

## Transform Lookup Without Timeout

### **Id**
tf-lookup-no-timeout
### **Severity**
warning
### **Type**
regex
### **Pattern**
  - lookup_transform\([^)]*\)(?![\s\S]{0,50}timeout)
### **Message**
Add timeout to lookup_transform to avoid blocking forever.
### **Fix Action**
Add timeout=Duration(seconds=1.0) parameter
### **Applies To**
  - **/*.py

## Potential Blocking Operation in Callback

### **Id**
blocking-in-callback
### **Severity**
info
### **Type**
regex
### **Pattern**
  - def.*callback.*:\s*[^}]*time\.sleep
  - def.*callback.*:\s*[^}]*requests\.
  - def.*callback.*:\s*[^}]*input\(
### **Message**
Avoid blocking operations in callbacks. Use async or separate threads.
### **Applies To**
  - **/*.py

## Hardcoded Topic Name (No Constant)

### **Id**
hardcoded-topic-name
### **Severity**
info
### **Type**
regex
### **Pattern**
  - create_publisher\([^,]+,\s*['"]/
  - create_subscription\([^,]+,\s*['"]/
### **Message**
Consider using constants or parameters for topic names.
### **Applies To**
  - **/*.py

## Default QoS Used for Sensor Subscription

### **Id**
default-qos-for-sensors
### **Severity**
info
### **Type**
regex
### **Pattern**
  - create_subscription\(.*Scan.*,\s*['"][^'"]+['"],\s*\w+,\s*\d+\)
  - create_subscription\(.*Image.*,\s*['"][^'"]+['"],\s*\w+,\s*\d+\)
### **Message**
Use sensor QoS profile for sensor topics (BEST_EFFORT reliability).
### **Fix Action**
Use qos_profile_sensor_data or custom BEST_EFFORT profile
### **Applies To**
  - **/*.py

## Transform Operations Without Exception Handling

### **Id**
no-exception-handling-tf
### **Severity**
warning
### **Type**
regex
### **Pattern**
  - lookup_transform(?![\s\S]{0,100}try:|except)
  - tf_buffer\.transform(?![\s\S]{0,100}try:|except)
### **Message**
Wrap TF operations in try/except TransformException.
### **Applies To**
  - **/*.py

## Lifecycle Node Missing Transition Callbacks

### **Id**
missing-lifecycle-transitions
### **Severity**
info
### **Type**
regex
### **Pattern**
  - class.*LifecycleNode(?![\s\S]{0,500}on_configure)
### **Message**
Implement lifecycle transition callbacks (on_configure, on_activate, etc.).
### **Applies To**
  - **/*.py

## Heavy Compute with Single-Threaded Executor

### **Id**
single-threaded-executor-compute
### **Severity**
info
### **Type**
regex
### **Pattern**
  - rclpy\.spin\(node\)(?![\s\S]{0,200}MultiThreadedExecutor)
### **Message**
Consider MultiThreadedExecutor for nodes with heavy computation.
### **Applies To**
  - **/*.py

## Missing Shutdown Handler

### **Id**
no-shutdown-handler
### **Severity**
info
### **Type**
regex
### **Pattern**
  - def main.*rclpy\.spin(?![\s\S]{0,200}finally:|shutdown)
### **Message**
Add finally block with rclpy.shutdown() for clean exit.
### **Applies To**
  - **/*.py