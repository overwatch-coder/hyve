# HYVE: System Architecture & Tech Stack

This document outlines the proposed system architecture for HYVE, an AI-powered platform that structures consumer reviews into actionable argument graphs.

## 1. High-Level Architecture

HYVE will operate on a modular, three-tier architecture:

1. **Frontend Application**: A modern, responsive web application where users (consumers and businesses) can search for products, view interactive review graphs, and explore detailed insights.

2. **Backend API**: A robust server layer that handles user authentication, data storage, and API requests.

3. **AI & Data Pipeline**: A dedicated processing engine that ingests unstructured text, relies on Large Language Models (LLMs) to extract claims, uses embeddings for clustering, and calculates sentiment/severity scores.

---

## 2. Proposed Tech Stack

### Frontend (Client-Side)

Building on modern React standards to ensure a premium, highly interactive user experience:

* **Framework**: **React** bundled with **Vite** for fast, optimized builds.

* **Styling**: **Tailwind CSS** (prioritizing solid colors over gradients per design rules).

* **UI Library**: **shadcn/ui** for accessible, customizable components (using **Sonner** for toast notifications).

* **Graph/Data Visualization**: **React Flow** or **Visx** to render the interactive, expandable "Decision Maps" and argument nodes.

* **Data Fetching**: **React Query** to manage server state and handle paginated API responses efficiently.

### Backend (Server-Side)

Given the AI-heavy nature of the application (NLP, embeddings, clustering), a Python-based backend is ideal.

* **Framework**: **FastAPI (Python)**. It is incredibly fast, natively supports asynchronous operations, and **automatically generates complete, production-grade OpenAPI specifications** (Swagger/ReDoc).

* **Database**: **PostgreSQL** for relational data integrity (ideal for managing products, users, raw reviews, and clustered themes).

* **ORM**: **SQLAlchemy** or **Prisma** (via Prisma Client Python).

* **Task Queue / Background Jobs**: **Celery** or **Arq** with a **Redis** broker. Review aggregation is computationally heavy and must be processed asynchronously in the background.

### AI Processing Engine (The Core Intelligence)

* **Argument Extraction**: **OpenAI API (GPT-4o)** or an open-source equivalent (e.g., Llama 3 via Groq) prompted to extract structured claims (Claim, Evidence, Context).

* **Thematic Clustering**: **Sentence-Transformers** (e.g., `all-MiniLM-L6-v2`) to convert extracted claims into vector embeddings, paired with **HDBSCAN** or **K-Means** to group them into themes like "Battery" or "Customer Service".

* **Sentiment & Severity**: **VADER** or a fine-tuned HuggingFace model (e.g., RoBERTa) to calculate the polarity (positive/negative) and confidence scores of each claim.

---

## 3. Core System Flow

1. **Ingestion Phase**: A product receives 500 unstructured reviews (via API integration, CSV upload, or scraping).

2. **Processing Phase (Asynchronous)**:
    * *Decomposition*: The AI extracts specific claims from the text (e.g., "Battery drains in 5 hours").
    * *Clustering*: The system maps this claim to the "Battery" node using vector similarity.
    * *Scoring*: Weights and sentiment are calculated based on frequency and extracted severity.

3. **Storage Phase**: The structured nodes, sub-claims, and their statistical weights are saved to PostgreSQL.

4. **Presentation Phase**: The React frontend queries the backend. The API handles the request, ensuring **all lists (reviews, arguments) are paginated**, and the frontend renders the visual decision map.

---

## 4. Key Data Entities (Database Schema Overview)

* **User**: `id`, `email`, `role` (consumer vs. business), `preferences`.

* **Product / Entity**: `id`, `name`, `category`, `overall_sentiment_score`.

* **Review (Raw)**: `id`, `product_id`, `original_text`, `source`, `star_rating`.

* **Claim (Extracted)**: `id`, `review_id`, `claim_text`, `evidence_text`, `sentiment_polarity`, `severity`.

* **Theme / Node (Clustered)**: `id`, `product_id`, `name` (e.g., "Camera"), `positive_ratio`, `claim_count`.
