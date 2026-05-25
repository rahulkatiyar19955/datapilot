# DataPilot 🚀

> AI-powered copilot that helps robotics engineers debug ROS robots instantly.

[![Next.js](https://img.shields.io/badge/Frontend-Next.js%20%2B%20TS-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Python-green?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Milvus](https://img.shields.io/badge/VectorDB-Milvus-blue?style=for-the-badge)](https://milvus.io/)
[![Docker](https://img.shields.io/badge/Container-Docker%20Compose-blue?style=for-the-badge&logo=docker)](https://www.docker.com/)

---

## 📌 Problem & Solution

### The Problem
Robotics software debugging is painfully slow. When a robot behaves unexpectedly or crashes, engineers are forced to download massive binary telemetry logs (rosbags), launch manual visualizers, and dig through millions of lines of unstructured logs on terminal topics. This manual process takes hours, causing long development delays and expensive operational downtime for robot fleets.

### The Solution
DataPilot parses and indexes ROS 2 bag files automatically, converting unstructured node telemetry into a structured timeline and a semantic vector database. Engineers simply upload a bag and ask, *"Why did navigation abort?"* or *"Why did the camera node drop frames?"*. The AI diagnostics engine pinpoints the root cause, cites the exact timestamps/nodes, and delivers actionable code parameter modifications in seconds.

---

## 📂 Project Planning & Architecture Documents

The project preparation is fully documented across these specialized planning artifacts:

* 📄 **[PRD.md](file:///Users/kati/Documents/kati_projects/dataPilot/PRD.md)**: Product Requirements, core user stories, and MoSCoW prioritization.
* 📄 **[ARCHITECTURE.md](file:///Users/kati/Documents/kati_projects/dataPilot/ARCHITECTURE.md)**: High-level layout, database schemas, API specs, and data flow.
* 📄 **[FOLDER_STRUCTURE.md](file:///Users/kati/Documents/kati_projects/dataPilot/FOLDER_STRUCTURE.md)**: Details the exact code layout for frontend, backend, and testing assets.
* 📄 **[TECH_DECISIONS.md](file:///Users/kati/Documents/kati_projects/dataPilot/TECH_DECISIONS.md)**: Why we chose our stack, trade-offs, and how we mitigate risk.
* 📄 **[SPRINT_PLAN.md](file:///Users/kati/Documents/kati_projects/dataPilot/SPRINT_PLAN.md)**: A day-by-day developer sprint timeline to execute the 1-week build.

---

## ⚡ Quick Start

To spin up the DataPilot full-stack application locally:

### 1. Prerequisites
Ensure you have Docker and Docker Compose installed on your system.

### 2. Environment Setup
Clone this repository and copy the environment template:
```bash
cp .env.example .env
```
Open `.env` and fill in your OpenAI or Anthropic API Keys:
```env
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Launching the App
Run the setup script which creates local data directories and starts the containers:
```bash
chmod +x setup.sh
./setup.sh
```
*Alternatively, run:*
```bash
docker-compose up --build
```
Once started:
* **Frontend**: Open `http://localhost:3000` in your browser.
* **Backend API Docs**: View Swagger UI at `http://localhost:8000/docs`.

---

## 👥 Hackathon Team (Role Assignments)

* **Dev 1 (Backend & Parser)**: Core FastAPI setup, ROS 2 binary parser, raw file systems.
* **Dev 2 (Frontend & UI)**: Next.js app construction, Tailwind stylings, timeline charting, state managers.
* **Dev 3 (ML & RAG Specialist)**: Milvus index design, text chunking, prompt engineering, LLM API client.
* **Dev 4 (Integrations / DevOps)**: Docker setups, demo datasets preparation, pitch deck creation, QA verification.
