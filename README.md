# 🐝 HYVE — Shop with Intelligence

HYVE is an AI-powered platform that transforms unstructured consumer reviews into structured, visual decision maps. Instead of reading hundreds of reviews, users see an interactive graph showing key themes, sentiment breakdowns, and weighted impact — turning narrative noise into actionable intelligence.

---

## Tech Stack

| Layer             | Technology                                              |
| ----------------- | ------------------------------------------------------- |
| Frontend          | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui  |
| Visualization     | React Flow, Dagre, Framer Motion                        |
| Data Fetching     | React Query, Axios                                      |
| Backend           | FastAPI (Python), Uvicorn                               |
| Database          | PostgreSQL (Neon), SQLAlchemy                           |
| AI Engine         | OpenAI GPT-4o / Google Gemini                           |
| Clustering        | Sentence-Transformers (`all-MiniLM-L6-v2`), K-Means     |
| Task Queue        | Celery + Upstash Redis                                  |
| Deployment        | Vercel (frontend), Render.com (backend + worker)        |

---

## Architecture Overview

```text
┌────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Frontend  │──────▶│  FastAPI Server   │──────▶│  PostgreSQL DB   │
│  (Vercel)  │       │  (Render - Web)   │       │  (Neon)          │
└────────────┘       └───────┬──────────┘       └──────────────────┘
                             │ .delay()                    ▲
                             ▼                             │
                     ┌──────────────────┐                  │
                     │  Upstash Redis   │                  │
                     │  (Message Queue) │                  │
                     └───────┬──────────┘                  │
                             │                             │
                             ▼                             │
                     ┌──────────────────┐                  │
                     │  Celery Worker   │──────────────────┘
                     │ (Render - Worker)│
                     └──────────────────┘
```

**How it works:** When a user submits reviews (via CSV, URL, or Amazon), the API instantly pushes the heavy AI processing (claim extraction, clustering, deduplication) into a Redis-backed Celery queue and returns immediately. A separate Celery worker process picks up the job and runs it independently, keeping the web server fast and responsive.

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Git**
- An **OpenAI API key** (or Google Gemini API key)
- An **Upstash Redis** URL (free tier at [upstash.com](https://upstash.com))
- A **PostgreSQL** database URL (free tier at [neon.tech](https://neon.tech))

---

## Getting Started (Local Development)

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-username/hyve.git
cd hyve
```

---

### Step 2 — Backend Setup

```bash
cd backend
```

**Create and activate a virtual environment:**

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

**Install dependencies:**

```bash
pip install -r requirements.txt
```

**Set up environment variables:**

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Edit `backend/.env` with your values:

```env
OPENAI_API_KEY=sk-your-key-here
LLM_PROVIDER="openai"                               # "openai" or "gemini"
DATABASE_URL=postgresql://user:pass@host/dbname      # Neon or local PostgreSQL
REDIS_URL=rediss://default:token@host:6379           # Upstash Redis URL
ADMIN_PASSWORD=your_admin_password
JWT_SECRET="your_jwt_secret"
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:8000"
CANOPY_API_KEY="your_canopy_key"                     # For Amazon product data
HF_TOKEN="your_hugging_face_token"                   # For embedding models
```

> **Note:** If using Gemini, set `LLM_PROVIDER="gemini"` and add `GEMINI_API_KEY` to your `.env`.

**Initialize the database:**

```bash
# Option A — Reset (drop & recreate tables)
python reset_db.py

# Option B — Seed with sample data (no API key needed)
python seed.py
```

**Start the API server (Terminal 1):**

```bash
uvicorn index:app --reload --port 8000
```

---

### Step 3 — Start the Celery Worker

> **This is required for any ingestion (CSV, URL, Amazon) to work.** Without the worker, tasks will be queued but never executed.

Open a **second terminal**, navigate to `backend/`, activate the venv, and run:

```bash
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

celery -A worker.celery_app worker --pool=solo --loglevel=info
```

> ⚠️ The `--pool=solo` flag is **required on Windows**. On macOS/Linux you can omit it.

You should see output like:

```text
 -------------- celery@yourpc v5.6.2 (emerald-rush)
--- ***** -----
-- ******* ---- [config]
- *** --- * --- .> app:         hyve_worker
- ** ---------- .> transport:   rediss://...upstash.io:6379//
...
[*] Ready.
```

---

### Step 4 — Frontend Setup

Open a **third terminal**:

```bash
cd frontend
npm install
```

**Set up environment variables:**

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

**Start the dev server:**

```bash
npm run dev
```

---

### Step 5 — Open the App

| URL                          | Description      |
| ---------------------------- | ---------------- |
| <http://localhost:5173>       | Frontend (Vite)  |
| <http://localhost:8000>       | Backend API      |
| <http://localhost:8000/docs>  | Swagger API docs |

---

## Running with Docker (Alternative)

If you prefer Docker for local development, a `docker-compose.yml` is provided in the project root:

```bash
docker-compose up -d --build
```

This starts:

- **PostgreSQL** on port `5433`
- **Adminer** (DB GUI) on port `8080`
- **Celery Worker** connected to your Upstash Redis

> **Note:** You still need to start the backend API server and frontend separately, or add them to the compose file.

---

## Production Deployment

### Frontend → Vercel

1. Push your repo to GitHub
2. Import the `frontend/` folder as a new project on [vercel.com](https://vercel.com)
3. Set the environment variable:
   - `VITE_API_BASE_URL` = your Render backend URL (e.g., `https://hyve-api.onrender.com`)
4. Deploy

### Backend → Render.com

On Render, you need **two separate services** built from the same `backend/` code:

| Render Service       | Type                  | Command                                                      |
| -------------------- | --------------------- | ------------------------------------------------------------ |
| `hyve-api`           | **Web Service**       | `uvicorn index:app --host 0.0.0.0 --port 8000` (Dockerfile) |
| `hyve-celery-worker` | **Background Worker** | `celery -A worker.celery_app worker --loglevel=info`         |

Both services share the **same Dockerfile**, the **same environment variables**, and communicate through **Upstash Redis**.

#### Option A — Render Blueprint (Recommended)

A `render.yaml` is provided in the project root. To use it:

1. Push the repo to GitHub (make sure `render.yaml` is in the root)
2. Go to Render Dashboard → **Blueprints** → Connect your repo
3. Render auto-detects both services
4. Add your environment variables in the dashboard (they're marked `sync: false` for security)
5. Deploy

#### Option B — Manual Setup

**Web Service:**

1. Render Dashboard → **New** → **Web Service**
2. Connect your repo
3. Set **Root Directory**: `backend`
4. Set **Environment**: `Docker`
5. Add all env vars from your `.env`
6. Deploy

**Background Worker:**

1. Render Dashboard → **New** → **Background Worker**
2. Connect the same repo
3. Set **Root Directory**: `backend`
4. Set **Environment**: `Docker`
5. Set **Docker Command**: `celery -A worker.celery_app worker --loglevel=info`
6. Copy in the **same env vars** as the web service
7. Deploy

> **Important:** Both services **must** have the same `REDIS_URL` (your Upstash URL). This is how they communicate — the API pushes tasks to the queue, and the worker pulls and executes them.

---

## Background Tasks & Celery

HYVE uses Celery for all heavy AI processing. Here's what runs as a background task:

| Task                         | Trigger                                        | What it does                                            |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `task_run_url_ingestion`     | POST `/ingest/url`                             | Scrapes a URL, extracts reviews, runs AI claim pipeline |
| `task_run_csv_ingestion`     | POST `/ingest/csv`                             | Parses CSV/Excel, groups by product, runs AI pipeline   |
| `task_run_amazon_ingestion`  | POST `/amazon/products/{asin}/analyze-amazon`  | Pipes cached Amazon reviews through AI engine           |
| `task_run_native_ingestion`  | POST `/amazon/products/{asin}/analyze-native`  | Pipes HYVE native reviews through AI engine             |
| `task_run_raw_ingestion`     | Raw text ingestion                             | AI-extracts products/reviews from unstructured text     |

All tasks are defined in `backend/worker.py` and dispatched via `.delay()` from the API routers.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable               | Required | Description                                    |
| ---------------------- | -------- | ---------------------------------------------- |
| `OPENAI_API_KEY`       | Yes*     | OpenAI API key for GPT-4o                      |
| `GEMINI_API_KEY`       | Yes*     | Google Gemini API key (if using Gemini)         |
| `LLM_PROVIDER`         | Yes      | `"openai"` or `"gemini"`                        |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string                   |
| `REDIS_URL`            | Yes      | Upstash Redis URL (`rediss://...`)             |
| `ADMIN_PASSWORD`       | Yes      | Password for admin endpoints                   |
| `JWT_SECRET`           | Yes      | Secret key for JWT token signing               |
| `FRONTEND_URL`         | Yes      | Frontend URL for CORS                          |
| `BACKEND_URL`          | Yes      | Backend URL (used in API docs)                 |
| `CANOPY_API_KEY`       | Yes      | Canopy API key for Amazon product data         |
| `HF_TOKEN`             | No       | Hugging Face token for embedding models        |
| `CLUSTERING_BACKEND`   | No       | `"embedding"` (default) or `"llm"`             |
| `CLUSTERING_FALLBACK`  | No       | Set to `"llm"` for auto-fallback               |
| `WARM_EMBEDDING_MODEL` | No       | Set to `"1"` to warm model at startup          |
| `AI_DEDUP_SINGLE_CALL` | No       | Set to `"1"` for optimized deduplication        |

_*One of `OPENAI_API_KEY` or `GEMINI_API_KEY` is required depending on `LLM_PROVIDER`._

### Frontend (`frontend/.env`)

| Variable              | Required | Description                        |
| --------------------- | -------- | ---------------------------------- |
| `VITE_API_BASE_URL`   | Yes      | Backend API URL                    |

---

## Database Management

```bash
cd backend

# Reset — drop all tables and recreate
python reset_db.py

# Seed — populate with sample data
python seed.py

# Ingest — real reviews via API (server must be running)
python ingest_reviews.py
```

---

## Project Structure

```text
hyve/
├── backend/
│   ├── index.py             # FastAPI app entry point
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # DB engine & session
│   ├── ai_engine.py         # LLM extraction & clustering
│   ├── pipeline.py          # Full AI processing pipeline
│   ├── worker.py            # Celery background tasks (Upstash Redis)
│   ├── routers/
│   │   ├── admin.py         # Admin endpoints
│   │   ├── amazon.py        # Amazon catalog & review analysis
│   │   ├── analytics.py     # Analytics & reporting
│   │   ├── claims.py        # Claim management
│   │   ├── experiments.py   # A/B testing experiments
│   │   ├── ingestion.py     # CSV, URL, raw text ingestion
│   │   ├── products.py      # Product CRUD
│   │   ├── reviews.py       # Review management
│   │   └── themes.py        # Theme management
│   ├── core/                # Shared utilities (pagination, security)
│   ├── ingest_reviews.py    # Review ingestion script
│   ├── seed.py              # Sample data seeder
│   ├── reset_db.py          # DB reset utility
│   ├── Dockerfile           # Docker image for API & worker
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/           # Home, Dashboard, Products, Explore, etc.
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── layouts/         # Page layouts
│   │   └── lib/             # Utilities
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
├── docker-compose.yml       # Local dev: Postgres + Adminer + Celery Worker
├── render.yaml              # Production: Render.com Blueprint (API + Worker)
└── README.md
```

---

## Quick Start (TL;DR)

```bash
# Clone
git clone https://github.com/your-username/hyve.git && cd hyve

# ── Terminal 1: Backend API ──
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # edit with your values
python reset_db.py
uvicorn index:app --reload --port 8000

# ── Terminal 2: Celery Worker ──
cd backend && venv\Scripts\activate
celery -A worker.celery_app worker --pool=solo --loglevel=info

# ── Terminal 3: Frontend ──
cd frontend
npm install
copy .env.example .env          # set VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Open <http://localhost:5173> and start exploring! 🐝

---

## License

Developed with ❤️ by **TEAM SPIDER - COMPUTER SCIENCE MODULE 2 IN SCI**.
