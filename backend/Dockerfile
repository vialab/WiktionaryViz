# syntax=docker/dockerfile:1

# Use a slim Python base image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# System deps (optional minimal tools) + create non-root user early
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl ca-certificates gzip \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system app \
    && adduser --system --ingroup app --home /app appuser

# Install Python deps first to leverage layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (exclude large data via .dockerignore)
COPY . .

# Ensure ownership for non-root runtime
RUN chown -R appuser:app /app

# Add entrypoint for data bootstrap
RUN chmod +x /app/entrypoint.sh

# Create data directory if not present (mount a volume for real data)
RUN mkdir -p /app/data && chown -R appuser:app /app/data

# Expose the port and run the server
EXPOSE 8000

# Entrypoint handles data download/unpack if missing then runs CMD
USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
