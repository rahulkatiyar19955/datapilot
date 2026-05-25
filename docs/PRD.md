# Product Requirements Document (PRD) - DataPilot

## 1. Executive Summary & Problem Statement

### The Problem
In modern robotics development and fleet operations, debugging is a notorious bottleneck. When a robot fails in the field or during testing, it generates massive volumes of binary telemetry data called "rosbags" (containing high-frequency sensor streams, control inputs, transform trees, and system logs), alongside standard OS logs. 

Currently, robotics engineers must download these large rosbags, load them into specialized plotting tools (like PlotJuggler or Foxglove Studio), read through raw `/rosout` text logs line by line, and reconstruct the timeline manually. This process often takes hours for a single failure, stalling deployment cycles and increasing downtime for active fleets.

### The Solution: DataPilot
DataPilot is an AI-powered copilot designed specifically for robotics engineers to debug ROS-based robots instantly. By uploading a rosbag file, the system automatically parses log messages, error states, and diagnostics. The engineer can then ask questions in natural language (e.g., *"Why did robot-12 stop at 14:05?"*), and DataPilot provides an immediate, grounded root-cause analysis along with suggested code or configuration fixes.

---

## 2. Target User Persona

* **Name**: Dr. Elena Rostova
* **Title**: Senior Robotics Software Engineer (Navigation & Fleet Triage)
* **Context**: Elena manages a fleet of 50 Autonomous Mobile Robots (AMRs) in a fulfillment warehouse.
* **Pain Points**:
  * Spends 30% of her week digging through rosbags to find out why a robot aborted a nav goal.
  * Navigating high-frequency sensor topics to find transient hardware communication drops is like finding a needle in a haystack.
  * Disconnected logging systems: she has to cross-reference `/rosout` terminal output, `/diagnostics` topics, and the controller state machines.
* **Goals**: Instantly identify why a robot's navigation stack failed, determine if it is a hardware issue or a software bug, and receive actionable fixes.

---

## 3. Core User Stories

* **Story 1: Ingestion and Summary**
  * *As a* Robotics Engineer,
  * *I want to* upload a ROS 2 bag file (`.mcap` or `.db3`) through a simple drag-and-drop web interface,
  * *So that* the backend can index the key text-based diagnostics and error logs and present a high-level metadata summary (topics, duration, start/end time, robot ID).

* **Story 2: Error Timeline Visualization**
  * *As a* Robotics Engineer,
  * *I want to* see a visual interactive timeline highlighting warning and error logs over the duration of the bag,
  * *So that* I can quickly locate where the system went into a degraded state.

* **Story 3: Natural Language Debugging (RAG Chat)**
  * *As a* Robotics Engineer,
  * *I want to* ask questions in natural language (e.g., *"Why did the navigation planner abort?"*),
  * *So that* the AI can scan the logs, pull relevant contextual timestamps/nodes, and provide a plain-English explanation of the root cause.

* **Story 4: Actionable Code/Config Fixes**
  * *As a* Robotics Engineer,
  * *I want to* receive specific recommendations (such as ROS parameter adjustments, launch file changes, or driver restart commands) from the AI,
  * *So that* I can immediately resolve the issue without researching error codes.

---

## 4. Feature Prioritization (MoSCoW)

### Must-Have (Hackathon MVP)
* **M.1: Ingestion Engine**: Support for uploading and parsing ROS 2 `.mcap` and `.db3` (SQLite) rosbags. Specifically extracting `/rosout` (standard log messages) and `/diagnostics` topics.
* **M.2: Interactive Timeline**: A frontend timeline component that plots log severity over time (Info, Warn, Error, Fatal).
* **M.3: Retrieval-Augmented Generation (RAG) Chat**: Core chat interface powered by an LLM (Claude-3.5-Sonnet or GPT-4o) using context retrieved from the bag logs.
* **M.4: Demo Datasets**: Hardcoded pre-recorded rosbags simulating specific common failure scenarios (e.g., "Lidar Driver Crash", "Navigation Collision", "Odom Drift/TF Timeout") so judges can test without uploading their own files.

### Should-Have (Stretch Goals)
* **S.1: Diagnostics Checker**: Automatically generate a "Quick Health Report" detailing node states, battery status, and sensor health immediately upon bag upload.
* **S.2: Code-Level Fix Recommendations**: AI provides git-diff-like code snippets or exact command-line syntax for the resolution.
* **S.3: Message Extraction**: Capability to inspect numerical values (e.g. battery level or CPU usage) on specific custom topics to back up the explanation.

### Could-Have (Post-Hackathon)
* **C.1: Multi-Bag Analysis**: Comparing a failing rosbag with a successful run on the same robot model to isolate diffs.
* **C.2: Live ROS Node Integration**: Direct plugin for ROS RViz/Foxglove to analyze telemetry in real time.
* **C.3: Vector DB Scaling**: Complete persistent deployment of a vector database (e.g., Qdrant or Pinecone) rather than a local lightweight index.

### Won't-Have (Out of Scope for Hackathon)
* **W.1: Large Bag Storage (GBs)**: Support for files larger than 250MB. (MVP will limit uploads to 250MB).
* **W.2: User Accounts & Multi-Tenancy**: Complete authentication system, RBAC, or subscription models.
* **W.3: Direct Remote Execution**: Automated deployment of fixes onto the physical robot via SSH/Ansible.

---

## 5. Success Criteria for the 1-Week Demo

1. **Successful Parsing**: 100% of the sample demo bags (under 150MB) parse successfully in less than 15 seconds.
2. **Context-Grounded Answers**: Zero hallucinations regarding ROS parameters. The AI must cite specific log lines and timestamps in its responses.
3. **End-to-End Execution**: A user can upload a bag, view the timeline, click on an error spike, and get an accurate explanation in the chat under 30 seconds total.
4. **Wow-Factor Demo**: A clean, modern, dark-mode user interface with a smooth terminal-like diagnostics aesthetic that feels native to robotics developers.

---

## 6. Key Assumptions & Constraints

* **Assumption 1**: The uploaded rosbags contain standard ROS `/rosout` messages. Without `/rosout` or `/diagnostics`, the AI will have limited text context and will rely on parsing message structures, which is much harder to generalize.
* **Assumption 2**: The hackathon environment runs on a single server or local developer machine (using Docker-Compose), meaning heavy database clusters are not feasible.
* **Constraint 1**: File transfer limits. Web-based uploads must remain under 200–250MB to prevent network timeouts during the demo.
* **Constraint 2**: Cost of LLM tokens. Since we will feed raw log contexts to the LLM, we must optimize retrieval size to avoid high latency and API cost.
