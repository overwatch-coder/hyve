# STAGE 1: Builder
FROM python:3.11-slim as builder

WORKDIR /build

# Install system dependencies needed for building some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .

# Optimize Torch for CPU to save ~700MB
# We install torch CPU first, then the rest.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
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

# Copy application code
COPY . .

# Install Playwright browser binaries (Chromium only for efficiency)
RUN playwright install chromium

# Expose port (adjust if your backend uses a different one)
EXPOSE 8000

# Run the application
CMD ["uvicorn", "index:app", "--host", "0.0.0.0", "--port", "8000"]
