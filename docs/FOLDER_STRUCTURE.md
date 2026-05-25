# Folder Structure - DataPilot

Below is the complete project directory structure for the DataPilot full-stack application. It uses a monorepo structure with independent directories for the `frontend` (Next.js + TypeScript) and `backend` (FastAPI + Python), along with a shared folder for sample data and project planning.

```
dataPilot/
├── .env.example                 # Example environment variables (API keys, ports)
├── .gitignore                   # Ignore node_modules, python venvs, SQLite db, data uploads
├── docker-compose.yml           # Runs Frontend & Backend containers concurrently
├── README.md                    # Project overview & quick start
├── setup.sh                     # Convenience script to set up local dev environment
│
├── backend/                     # Python/FastAPI Backend Services
│   ├── Dockerfile               # Python environment builder
│   ├── requirements.txt         # Core dependencies (fastapi, mcap, pymilvus, openai, uvicorn)
│   ├── main.py                  # Entrypoint for FastAPI
│   └── app/
│       ├── __init__.py
│       ├── config.py            # Environment configurations (settings, file directories)
│       ├── database.py          # SQLAlchemy connection & session setup
│       ├── models.py            # SQLite schema models (Sessions, Logs, Messages)
│       ├── schemas.py           # Pydantic schemas for request/response validation
│       ├── api/                 # Endpoint routers
│       │   ├── __init__.py
│       │   ├── upload.py        # Ingestion API (saves files & triggers parsing)
│       │   ├── sessions.py      # Session metadata & timeline queries
│       │   └── chat.py          # AI dialogue & RAG orchestration endpoints
│       └── services/            # Core business logic
│           ├── __init__.py
│           ├── parser.py        # ROS 2 bag parsing pipeline (extracts /rosout & diagnostics)
│           ├── vector_store.py  # Milvus interactions (generating & searching embeddings)
│           └── llm_agent.py     # Prompt templates & LLM coordinator client
│
├── frontend/                    # Next.js Frontend client
│   ├── Dockerfile               # Node builder & runner configuration
│   ├── package.json             # NPM dependencies (next, react, recharts, tailwind, lucide-react, framer-motion, react-markdown, react-dropzone)
│   ├── next.config.js           # Next.js configurations
│   ├── tailwind.config.js       # Tailwind theme customization (Terminal color palettes)
│   ├── postcss.config.js        # CSS preprocessing configuration
│   └── src/
│       ├── app/                 # Next.js App Router
│       │   ├── layout.tsx       # Root layout configuration
│       │   ├── page.tsx         # Main dashboard layout
│       │   └── globals.css      # Base Tailwind imports & custom fonts
│       ├── components/          # Reusable UI modules
│       │   ├── ChatTerminal.tsx # AI Chat window (Terminal style interface)
│       │   ├── LogTimeline.tsx  # Interactive error timeline charts (using Recharts)
│       │   ├── MetadataCard.tsx # Robot health & ROS topic overview
│       │   └── UploadZone.tsx   # Drag-and-drop file ingestion pane
│       ├── hooks/               # React Custom hooks
│       │   ├── useChat.ts       # Coordinates chat messaging state and api calls
│       │   └── useUpload.ts     # Tracks upload progress and file states
│       ├── services/            # HTTP clients
│       │   └── api.ts           # Axios instance configuring backend interactions
│       ├── types/               # TypeScript interfaces
│       │   └── index.ts         # Types for Logs, Chat, Session, Timeline
│       └── utils/
│           └── helpers.ts       # Time formatting and log level style mapping
│
├── sample_bags/                 # Pre-recorded ROS 2 bags for demo validations
│   ├── README.md                # Guide on what failure each bag simulates
│   ├── lidar_failure.mcap       # Simulates sensor driver crash
│   ├── nav_drift_failure.mcap   # Simulates high odometry covariance (tf drift)
│   └── controller_abort.mcap    # Simulates robot blocking recovery retry failure
│
└── docs/                        # Planning & Documentation artifacts
    ├── PRD.md                   # Product Requirements Document
    ├── ARCHITECTURE.md          # System Architecture & API layouts
    ├── TECH_DECISIONS.md        # Technical trade-offs & Risk matrices
    └── SPRINT_PLAN.md           # 7-Day Agile roadmap
```

---

## Folder Descriptions

### Backend (`/backend`)
* **`app/services/parser.py`**: Reads binary `.mcap` files using the `mcap` library. Traverses records, filters messages from `/rosout` or `/diagnostics`, and builds structured dicts for DB inserts.
* **`app/services/vector_store.py`**: Interfaces with Milvus. When `parser.py` finishes, it writes warning/error messages as documents. It embeds these strings using OpenAI embeddings or a lightweight local model.
* **`app/services/llm_agent.py`**: Orchestrates OpenAI/Claude API calls. Receives user prompt, queries Milvus and SQLite, constructs a structured system prompt containing contextual logs, and retrieves the explanation.

### Frontend (`/frontend`)
* **`src/components/LogTimeline.tsx`**: Renders a bar or scatter chart of errors/warnings over time. Clicking on an error spike updates the visual filter to that time window and pre-fills the chat input with search context.
* **`src/components/ChatTerminal.tsx`**: High-fidelity dark mode terminal layout where user inputs queries. It formats code blocks nicely, parses markdown, and features quick-click prompt chips (e.g. *"Explain the error at 12s"*).

### Sample Bags (`/sample_bags`)
* Provides mock `.mcap` datasets. If judges don't have a rosbag, they can click "Load Demo Bag" on the UI, which points the backend to load one of these pre-saved bags instantly.
