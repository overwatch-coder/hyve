# 🐝 HYVE — Shop with Intelligence

HYVE is an AI-powered platform that transforms unstructured consumer reviews into structured, visual decision maps. Instead of reading hundreds of reviews, users see an interactive graph showing key themes, sentiment breakdowns, and weighted impact — turning narrative noise into actionable intelligence.

---

## Tech Stack

| Layer         | Technology                                               |
| ------------- | -------------------------------------------------------- |
| Frontend      | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui   |
| Visualization | React Flow, Dagre, Framer Motion                         |
| Data Fetching | React Query, Axios                                       |
| Backend       | FastAPI (Python), Uvicorn                                |
| Database      | PostgreSQL 15, SQLAlchemy                                |
| AI / LLM      | OpenAI GPT-4o or Google Gemini 2.5 Flash                 |
| Embeddings    | OpenAI `text-embedding-3-small` or Gemini `gemini-embedding-001` (API-based, no local model) |
| Task Queue    | Background Threads (default) / Celery + Redis (optional) |
| Cache         | Redis (embedding cache, optional Celery broker)          |
| Deployment    | Vercel + Render.com **or** AWS EC2 (Docker Compose)      |

---

## Architecture Overview

```text
┌────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Frontend  │──────▶│  FastAPI Server   │──────▶│  PostgreSQL DB   │
│            │       │                   │       │                  │
└────────────┘       └───────┬──────────┘       └──────────────────┘
                             │ enqueue()
                             ▼
                     ┌──────────────────┐
                     │ Background Thread │
                     │  (same process)  │
                     └──────────────────┘
                       AI Processing:
                       • Claim Extraction (LLM)
                       • Embedding via API (OpenAI / Gemini)
                       • Clustering (K-Means)
                       • Deduplication
```

**How it works:** When a user submits reviews (via CSV, URL, or Amazon ASIN), the API instantly dispatches the heavy AI processing to a background thread and returns immediately. Embeddings are computed via the OpenAI or Gemini API — no local model, no GPU, no large RAM requirements. When you're ready to scale, set `USE_CELERY=true` to upgrade to a dedicated Celery worker without changing any code.

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Git**
- An **OpenAI API key** (`LLM_PROVIDER=openai`) **or** a **Google Gemini API key** (`LLM_PROVIDER=gemini`) — also used for embeddings
- A **PostgreSQL** database URL — free options: [Neon](https://neon.tech), local Docker, or SQLite for quick local dev
- A **Redis** URL — [Upstash](https://upstash.com) free tier works, or run Redis locally

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
# LLM — choose one provider
LLM_PROVIDER=openai                                  # "openai" or "gemini"
OPENAI_API_KEY=sk-your-openai-key                    # required if LLM_PROVIDER=openai
GEMINI_API_KEY=your-gemini-key                       # required if LLM_PROVIDER=gemini

# Database — SQLite works for zero-setup local dev
DATABASE_URL=sqlite:///hyvedb.sqlite3                # or postgresql://user:pass@host/db

# Redis — used for embedding cache (and Celery if enabled)
REDIS_URL=redis://localhost:6379/0
EMBEDDING_CACHE_REDIS_URL=redis://localhost:6379/1

# Auth
ADMIN_PASSWORD=your_admin_password
JWT_SECRET=your_jwt_secret

# URLs (used for CORS + API docs)
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# Amazon product data (optional)
CANOPY_API_KEY=your_canopy_key

# Background tasks
USE_CELERY=false                                     # set "true" to use Celery + Redis
```

> **Embeddings:** HYVE uses the same API key you provide for LLM calls — no separate embedding service or local model download required.

**Initialize the database:**

```bash
# Option A — Reset (drop & recreate tables)
python reset_db.py

# Option B — Seed with sample data (no reviews needed)
python seed.py
```

**Start the API server:**

```bash
uvicorn index:app --reload --port 8000
```

---

### Step 3 — Frontend Setup

Open a **new terminal**:

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
VITE_API_URL=http://localhost:8000
```

**Start the dev server:**

```bash
npm run dev
```

---

### Step 4 — Open the App

| URL                          | Description      |
| ---------------------------- | ---------------- |
| <http://localhost:5173>      | Frontend (Vite)  |
| <http://localhost:8000>      | Backend API      |
| <http://localhost:8000/docs> | Swagger API docs |

---

## Running with Docker Compose (Full Stack)

The `docker-compose.yml` in the project root runs the **entire stack** — frontend, backend, PostgreSQL, and Redis — in one command. No separate installs required.

```bash
# Copy and fill in your secrets
cp backend/.env.example backend/.env.production
nano backend/.env.production

# Start everything
docker compose up -d --build
```

This starts:

| Service      | Port  | Description                |
| ------------ | ----- | -------------------------- |
| `frontend`   | 80    | Nginx-served React app     |
| `backend`    | 8000  | FastAPI + Uvicorn          |
| `postgres`   | 5432  | PostgreSQL 15              |
| `redis`      | 6379  | Redis 7 (cache + broker)   |

> **First run:** The backend auto-creates all tables on startup. No manual migration step needed.

---

## Production Deployment

HYVE supports two deployment paths. Choose the one that fits your needs:

---

### Option A — Vercel (Frontend) + Render.com (Backend)

Best for: zero-infrastructure, quick deploys, free tier friendly (with cold starts on Render free plan).

#### Frontend → Vercel

1. Push your repo to GitHub
2. Import the `frontend/` folder as a new project on [vercel.com](https://vercel.com)
3. Set environment variables in the Vercel dashboard:
   - `VITE_API_BASE_URL` = your Render backend URL (e.g., `https://hyve-api.onrender.com`)
   - `VITE_API_URL` = same value as above
4. Deploy

#### Backend → Render.com

1. Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repo
3. Set **Root Directory**: `backend`
4. Set **Environment**: `Docker`
5. Add all required env vars (see [Environment Variables Reference](#environment-variables-reference))
6. Deploy

Background AI tasks run inside the same server process using background threads — no separate paid worker service needed.

> **Scaling up:** When traffic grows, add `USE_CELERY=true` and provision a Background Worker on Render with the command `celery -A worker.celery_app worker --loglevel=info`. No code changes needed.

---

### Option B — AWS EC2 (Docker Compose, Self-Hosted)

Best for: full control, no cold starts, free-tier eligible with `t3.micro`, HTTPS support via DuckDNS + Let's Encrypt.

See the full step-by-step guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

Highlights:
- Runs the entire stack on a single EC2 `t3.micro` instance (free tier)
- One-command deploys via `deploy.sh` (push → SSH → pull → rebuild)
- Optional HTTPS via free [DuckDNS](https://www.duckdns.org) subdomain + Let's Encrypt
- PostgreSQL and Redis are included in the Docker Compose stack — no external DB service needed

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable                   | Required | Description                                                   |
| -------------------------- | -------- | ------------------------------------------------------------- |
| `LLM_PROVIDER`             | Yes      | `"openai"` or `"gemini"`                                      |
| `OPENAI_API_KEY`           | Yes*     | OpenAI API key — used for LLM calls **and** embeddings        |
| `GEMINI_API_KEY`           | Yes*     | Google Gemini API key — used for LLM calls **and** embeddings |
| `DATABASE_URL`             | Yes      | PostgreSQL or SQLite connection string                        |
| `REDIS_URL`                | Yes      | Redis URL for embedding cache (and Celery broker if enabled)  |
| `EMBEDDING_CACHE_REDIS_URL`| No       | Separate Redis DB for embeddings (defaults to `REDIS_URL`)    |
| `ADMIN_PASSWORD`           | Yes      | Password for admin endpoints                                  |
| `JWT_SECRET`               | Yes      | Secret key for JWT token signing                              |
| `FRONTEND_URL`             | Yes      | Frontend URL for CORS allow-list                              |
| `BACKEND_URL`              | Yes      | Backend URL (used in API docs)                                |
| `CANOPY_API_KEY`           | No       | Canopy API key for Amazon product data                        |
| `USE_CELERY`               | No       | `"true"` to dispatch tasks via Celery; default `"false"`      |
| `CLUSTERING_BACKEND`       | No       | `"embedding"` (default) or `"llm"`                            |
| `CLUSTERING_FALLBACK`      | No       | `"llm"` to auto-fallback if embedding clustering fails        |
| `AI_DEDUP_SINGLE_CALL`     | No       | `"1"` for optimized single-call deduplication                 |
| `DOMAIN`                   | No       | Your domain/hostname — required only for HTTPS on AWS         |

_*Exactly one of `OPENAI_API_KEY` or `GEMINI_API_KEY` is required, matching your `LLM_PROVIDER` choice._

### Frontend (`frontend/.env`)

| Variable            | Required | Description                               |
| ------------------- | -------- | ----------------------------------------- |
| `VITE_API_BASE_URL` | Yes      | Backend API base URL                      |
| `VITE_API_URL`      | Yes      | Backend API URL (used by some hooks)      |

---

## Background Tasks

HYVE uses a smart task dispatcher (`core/tasks.py`) for all heavy AI processing. By default, tasks run in **background threads** within the same server process — zero extra cost. When `USE_CELERY=true` is set, tasks are dispatched to a dedicated Celery worker via Redis instead.

| Task                              | Trigger                                           | What it does                                            |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `run_url_ingestion_background`    | `POST /ingest/url`                                | Scrapes a URL, extracts reviews, runs AI claim pipeline |
| `run_csv_ingestion_background`    | `POST /ingest/csv`                                | Parses CSV/Excel, groups by product, runs AI pipeline   |
| `run_amazon_ingestion_background` | `POST /amazon/products/{asin}/analyze-amazon`     | Pipes cached Amazon reviews through AI engine           |
| `run_native_ingestion_background` | `POST /amazon/products/{asin}/analyze-native`     | Pipes HYVE native reviews through AI engine             |
| `run_raw_ingestion_background`    | Raw text ingestion                                | AI-extracts products/reviews from unstructured text     |

All tasks are dispatched via `enqueue()` from the API routers.

---

## Database Management

```bash
cd backend

# Reset — drop all tables and recreate (USE WITH CAUTION in production)
python reset_db.py

# Seed — populate with sample data for testing
python seed.py
```

---

## Project Structure

```text
hyve/
├── backend/
│   ├── index.py              # FastAPI app entry point
│   ├── models.py             # SQLAlchemy models
│   ├── schemas.py            # Pydantic schemas
│   ├── database.py           # DB engine & session
│   ├── ai_engine.py          # LLM extraction & clustering
│   ├── pipeline.py           # Full AI processing pipeline
│   ├── worker.py             # Celery background tasks
│   ├── routers/
│   │   ├── admin.py          # Admin endpoints
│   │   ├── amazon.py         # Amazon catalog & review analysis
│   │   ├── analytics.py      # Analytics & reporting
│   │   ├── claims.py         # Claim management
│   │   ├── experiments.py    # A/B testing experiments
│   │   ├── ingestion.py      # CSV, URL, raw text ingestion
│   │   ├── products.py       # Product CRUD
│   │   ├── reviews.py        # Review management
│   │   └── themes.py         # Theme management
│   ├── core/                 # Shared utilities (tasks, pagination, security)
│   ├── seed.py               # Sample data seeder
│   ├── reset_db.py           # DB reset utility
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/            # Home, Dashboard, Products, Explore, etc.
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── layouts/          # Page layouts
│   │   └── lib/              # Utilities & API client
│   ├── nginx.conf            # HTTP Nginx config
│   ├── nginx-https.conf      # HTTPS Nginx config template (AWS)
│   ├── start.sh              # Entrypoint: auto-switches HTTP↔HTTPS
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
├── docker-compose.yml        # Full stack: frontend, backend, postgres, redis
├── deploy.sh                 # One-command deploy to AWS EC2 (run locally)
├── .deploy.env.example       # EC2 credentials template for deploy.sh
├── DEPLOYMENT.md             # Full AWS EC2 deployment guide
└── README.md
```

---

## Quick Start (TL;DR)

```bash
# Clone
git clone https://github.com/your-username/hyve.git && cd hyve

# ── Terminal 1: Backend ──
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # edit with your keys
python reset_db.py
uvicorn index:app --reload --port 8000

# ── Terminal 2: Frontend ──
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Open <http://localhost:5173> and start exploring! 🐝

---

## License

Developed with ❤️ by **TEAM SPIDER - COMPUTER SCIENCE MODULE 2 IN SCI**.
