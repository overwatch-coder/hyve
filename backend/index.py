from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import logging
from dotenv import load_dotenv

# Suppress Windows asyncio ProactorEventLoop ConnectionResetError
if sys.platform == "win32":
    import asyncio
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)

# Internal imports
load_dotenv()

import models
from database import engine

# Create the database tables
models.Base.metadata.create_all(bind=engine)

# Ad-hoc migration for SQLite: Add processing_step to products if missing
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE products ADD COLUMN processing_step VARCHAR"))
        conn.commit()
        print("MIGRATION: Added processing_step column to products table.")
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE products ADD COLUMN summary_seller TEXT"))
        conn.commit()
    except Exception: pass
    try:
        conn.execute(text("ALTER TABLE products ADD COLUMN advices_seller TEXT"))
        conn.commit()
    except Exception: pass

app = FastAPI(
    title="HYVE API",
    description="Backend API for structured consumer reviews and AI analysis.",
    version="1.0.0",
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Configure CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
@app.get("/", tags=["Root"], include_in_schema=False)
def root():
    return {"message": "Welcome to the HYVE API", "docs": f"{BACKEND_URL}/docs"}

# Import routers
from routers import admin, products, reviews, themes, claims, analytics, ingestion, experiments, amazon

# Include routers
app.include_router(admin.router)
app.include_router(products.router)
app.include_router(reviews.router)
app.include_router(themes.router)
app.include_router(claims.router)
app.include_router(analytics.router)
app.include_router(ingestion.router)
app.include_router(experiments.router)
app.include_router(amazon.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
