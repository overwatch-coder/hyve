# STAGE 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /build

# Install system dependencies needed for building some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# STAGE 2: Final Image
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Playwright (Chromium only)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Install Playwright browser binaries (Chromium only for efficiency).
# Placed before COPY . . so this expensive step is not cache-busted by code changes.
RUN playwright install chromium

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Health check using Python stdlib (curl is not present in python:3.11-slim).
# start-period=30s: no local model loading — app starts fast.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=8)"

CMD ["uvicorn", "index:app", "--host", "0.0.0.0", "--port", "8000"]
