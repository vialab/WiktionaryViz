# 📚 WiktionaryViz Backend API (FastAPI)

A high-performance backend API for serving data from a large `wiktionary_data.jsonl` file (20GB+) using **FastAPI**, **mmap**, and a **precomputed index** for fast lookups.

---

## 🚀 Features

- Search for words quickly without reading the entire file.
- Uses an index for `{word, lang_code} → byte offset` mapping.
- Memory-mapped file I/O (`mmap`) for fast and efficient reads.
- CORS enabled for frontend integration.
- Easy to scale and extend!

---

## ✅ Prerequisites

- Python 3.9+
- FastAPI, Uvicorn, and tqdm installed (see below)
- `wiktionary_data.jsonl` file (20GB+ JSONL file)

---

## 🏗️ Folder Structure

```txt
/backend
├── wiktionary_data.jsonl       # Your main dataset (20GB+)
├── wiktionary_index.json       # Generated index mapping word/lang_code to byte offsets
├── main.py                     # FastAPI app
├── build_index.py              # Script to create the index from JSONL
├── requirements.txt
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Create and activate a virtual environment (Recommended)

```bash
python -m venv venv

# On Mac/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

---

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

> `requirements.txt` includes:

```txt
fastapi
uvicorn
tqdm
```

---

### 3. Place Your `wiktionary_data.jsonl` File

- Add your **full** `wiktionary_data.jsonl` file to the `/backend/` directory.
- Example:

```txt
/backend/wiktionary_data.jsonl
```

---

### 4. Build the Index File (Run Once)

The index speeds up lookups by storing file positions for each `{word, lang_code}` combo.

#### Run the index script

```bash
python build_index.py
```

This will:

- Scan `wiktionary_data.jsonl`
- Generate `wiktionary_index.json`

Progress will be printed in batches (e.g. every 100,000 records).

---

## 🖥️ Running the Server

Start the FastAPI server using Uvicorn:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Server will be available at:

```http
http://localhost:8000
```

---

## 🌐 API Endpoints

### `/`

Basic health check.

```http
GET http://localhost:8000/
```

Response:

```json
{
  "message": "FastAPI JSONL Backend is running"
}
```

---

### `/word-data`

Fetch all matching entries by `word` and `lang_code`.

```http
GET http://localhost:8000/word-data?word=tea&lang_code=en
```

#### Query Parameters

| Name        | Required | Description                     |
| ----------- | -------- | ------------------------------- |
| `word`      | ✅ Yes    | The word you're searching for   |
| `lang_code` | ✅ Yes    | Language code (e.g. `en`, `fr`) |

#### Example Response

```json
{
  "word": "tea",
  "lang": "English",
  "lang_code": "en",
  "translations": [...],
  "etymology_templates": [...],
  ...
},
```

---

## 🐳 Docker (Recommended for portability)

You can run the backend in a container. This keeps dependencies isolated and lets you ship the service easily.

### Build and run with Docker directly

1. Build the image

  ```bash
  docker build -t wiktionaryviz-backend ./backend
  ```

1. Run the container (mounting host data so large files stay outside the image)

  ```bash
  docker run --name wiktionaryviz-backend \
    -p 8000:8000 \
    -e OPENAI_API_KEY=$OPENAI_API_KEY \
    -v "$(pwd)/backend/data:/app/data" \
    wiktionaryviz-backend
  ```

The API will be available at:

```http
http://localhost:8000
```

On first start, the app will build the index if needed. Keep the large `wiktionary_data.jsonl` in `backend/data` on the host—the container reads it via the volume.

### Orchestration with Docker Compose

A `docker-compose.yml` is provided at the repo root:

```bash
docker compose up --build
```

This will:

- Build the backend image from `backend/`
- Publish port 8000
- Mount `./backend/data` into `/app/data` inside the container
- Pass through `OPENAI_API_KEY` if set

#### Automatic dataset bootstrap

On first start, if `/app/data/wiktionary_data.jsonl` is missing, the container will automatically download and prepare the dataset before starting the API.

Controls (set in your shell or a `.env` file used by Compose):

- `WIKTIONARY_DATA_URL` — Source URL for the dataset. Defaults to `https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz`. Supports `.gz` (auto-unzipped) or plain `.jsonl`.
- `SKIP_DOWNLOAD` — When set to `1`, skips the auto-download (useful if you mount your own data file). Default `0`.

Notes:

- The dataset is large (20GB+ uncompressed). Ensure you have sufficient disk space in `./backend/data` on the host.
- The first run may take a long time while downloading and unzipping.

Stop with:

```bash
docker compose down
```

### Notes for production

- Serve the backend behind HTTPS (reverse proxy like Nginx/Caddy or a managed platform) to avoid mixed-content when your frontend is on HTTPS.
- Restrict CORS origins in `main.py` for production.

### Cloudflare Tunnel (quick dev and stable named)

You can expose the backend over HTTPS without managing a server.

Quick dev tunnel (ephemeral URL):

```bash
docker compose up -d tunnel
docker compose logs -f tunnel # copy the trycloudflare.com URL
```

Named tunnel (stable subdomain):

1. Authenticate and create a tunnel on your machine (one-time):

```bash
cloudflared tunnel login
cloudflared tunnel create wiktionaryviz-backend
# Route a DNS name to the tunnel (replace with your hostname)
cloudflared tunnel route dns wiktionaryviz-backend api.example.com
```

1. In Cloudflare dash, copy the "Run tunnel" token and set it in your environment:

```bash
export TUNNEL_TOKEN=... # or add to .env for compose
```

1. Start the named tunnel service:

```bash
docker compose up -d tunnel-named
```

Your backend should now be available at `https://api.example.com`.

### Frontend build with API base (GitHub Pages)

Build and deploy the frontend using your backend URL:

```bash
VITE_API_BASE=https://api.example.com npm run deploy
```

### GitHub Actions

- Backend image build: `.github/workflows/backend-docker.yml`
- Frontend deploy with `VITE_API_BASE` secret: `.github/workflows/frontend-deploy.yml`

### Environment

Key environment variables:

- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins. When set, credentials are enabled; when `*`, credentials are disabled.
- `OPENAI_API_KEY` (optional): Enables AI IPA estimation when a pronunciation is missing.
- `PORT` (default `8000`): Port to expose.
- `TUNNEL_TOKEN` (for named tunnel): Token used by `tunnel-named` compose service.

### Healthcheck

The Docker Compose file includes a basic healthcheck that hits `/`:

```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request as u; u.urlopen('http://localhost:8000/').read()"]
  interval: 30s
  timeout: 5s
  retries: 3
```

### Troubleshooting

- Mixed-content errors when called from GitHub Pages:
  - Serve the backend over HTTPS (Cloudflare Tunnel or reverse proxy).

- CORS blocked:
  - Set `ALLOWED_ORIGINS=https://vialab.github.io` and restart the container.

- Slow first requests:
  - Index build may run on first start if missing; keep `backend/data` mounted as a volume so builds persist.

## 🏎️ How It Works (High-Level)

1. On startup, `main.py` loads the **index** from `wiktionary_index.json`.
2. The API uses the index to **seek directly** to file positions in `wiktionary_data.jsonl`.
3. Data is read efficiently using **mmap**, not loaded into RAM.
4. Fast lookup, low memory usage even on 20GB+ files.

---

## 🔧 Developer Tips

- If you add new data to `wiktionary_data.jsonl`, re-run:

```bash
python build_index.py
```

- To deploy on production:
  - Disable `--reload` in Uvicorn.
  - Restrict `allow_origins` in CORS middleware.
