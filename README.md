# 🐝 HYVE — Shop with Intelligence

HYVE is an AI-powered platform that transforms unstructured consumer reviews into structured, visual decision maps. Instead of reading hundreds of reviews, users see an interactive graph showing key themes, sentiment breakdowns, and weighted impact thereby turning narrative noise into actionable intelligence.

---

## Tech Stack

| Layer             | Technology                                              |
| ----------------- | ------------------------------------------------------- |
| Frontend          | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui  |
| Visualization     | React Flow, Dagre, Framer Motion                        |
| Data Fetching     | React Query, Axios                                      |
| Backend           | FastAPI (Python), Uvicorn                               |
| Database          | SQLite (dev) / PostgreSQL (prod), SQLAlchemy            |
| AI Engine         | OpenAI GPT-4o / Google Gemini                           |
| Clustering        | Sentence-Transformers (`all-MiniLM-L6-v2`), K-Means     |
| Task Queue        | Celery + Redis                                          |

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Git**
- **Redis** _(optional — only for Celery background tasks)_

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/hyve.git
cd hyve
```

### 2. Backend Setup

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
LLM_PROVIDER="openai"                      # "openai" or "gemini"
DATABASE_URL=sqlite:///./hyvedb.sqlite3     # or a PostgreSQL URL
REDIS_URL=redis://localhost:6379/0
ADMIN_PASSWORD=your_admin_password
JWT_SECRET="your_jwt_secret"
```

> If using Gemini, set `LLM_PROVIDER="gemini"` and add `GEMINI_API_KEY` to your `.env`.

**Initialize the database** (choose one):

```bash
# Option A — Reset (drop & recreate tables)
python reset_db.py

# Option B — Seed with sample data (no API key needed)
python seed.py
```

**Start the server:**

```bash
uvicorn main:app --reload --port 8000
```

**Ingest real review data** (requires running server + API key):

```bash
python ingest_reviews.py
```

This creates products, ingests reviews, extracts claims via the LLM, and clusters them into themes automatically.

### 3. Frontend Setup

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
```

**Start the dev server:**

```bash
npm run dev
```

### 4. Open the App

| URL                           | Description               |
| ----------------------------- | ------------------------- |
| <http://localhost:3000>       | Frontend                  |
| <http://localhost:8000>       | Backend API               |
| <http://localhost:8000/docs>  | Swagger API docs          |

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

To use **PostgreSQL** instead of SQLite, update `DATABASE_URL` in `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/hyvedb
```

---

## Project Structure

```text
hyve/
├── backend/
│   ├── main.py              # FastAPI app & all endpoints
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # DB engine & session
│   ├── ai_engine.py         # LLM extraction & clustering
│   ├── pipeline.py          # Full AI processing pipeline
│   ├── worker.py            # Celery background worker
│   ├── ingest_reviews.py    # Review ingestion script
│   ├── seed.py              # Sample data seeder
│   ├── reset_db.py          # DB reset utility
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
└── README.md
```

---

## Quick Start (TL;DR)

```bash
# Clone
git clone https://github.com/your-username/hyve.git && cd hyve

# Backend
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # edit with your values
python reset_db.py
uvicorn main:app --reload --port 8000

# Seed data (new terminal, venv activated)
cd backend && python ingest_reviews.py

# Frontend (new terminal)
cd frontend
npm install
copy .env.example .env          # set VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

---

## License

Developed with ❤️ by **TEAM SPIDEER - COMPUTER SCIENCE MODULE 2 IN SCI**.
