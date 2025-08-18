# syntax=docker/dockerfile:1

# Use a slim Python base image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# System deps (optional minimal tools)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first to leverage layer caching
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy application code (exclude large data via .dockerignore)
COPY . .

# Create data directory if not present (mount a volume for real data)
RUN mkdir -p /app/data

# Expose the port and run the server
EXPOSE 8000

# Default command (can be overridden to pass --rebuild-index)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
