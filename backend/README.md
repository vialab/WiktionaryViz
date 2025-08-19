# 📚 WiktionaryViz Backend API (FastAPI)

A high-performance backend API that serves data from a large `wiktionary_data.jsonl` (20GB+) using **FastAPI**, **mmap**, and a **precomputed index** for fast lookups.

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
- `pip` to install Python packages
- `wiktionary_data.jsonl` (20GB+ JSONL file)

---

## 🏗️ Folder Structure

```txt
/backend
├── data/
│   ├── wiktionary_data.jsonl       # Main dataset (20GB+)
│   ├── wiktionary_index.json       # Generated index: {"word_lang": byte_offset}
│   ├── longest_words.json          # Precomputed stats (built by build_index.py)
│   ├── most_translations.json      # Precomputed stats (built by build_index.py)
│   └── most_descendants.json       # Precomputed stats (built by build_index.py)
├── api_routes/                     # API route modules
├── services/                       # Utilities (alignment, IO)
├── main.py                         # FastAPI app
├── build_index.py                  # Index + stats builder
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

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

Key packages (see full pinned list in `requirements.txt`): FastAPI, Uvicorn, PanPhon, httpx, tqdm, python-dotenv, openai (optional).

---

### 3. Place your `wiktionary_data.jsonl`

- Put the file in `backend/data/`:

```txt
/backend/data/wiktionary_data.jsonl
```

---

### 4. Build the index file (run once)

The index speeds up lookups by storing file positions for each `{word, lang_code}` combo.

#### Run the index script

```bash
python build_index.py
```

This will:

- Scan `data/wiktionary_data.jsonl`
- Generate `data/wiktionary_index.json` and precomputed stats files in `data/`

Progress will be printed in batches (e.g. every 100,000 records).

---

## 🖥️ Run the server

Start the FastAPI server using Uvicorn:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Server will be available at:

Server will be available at: http://localhost:8000

Interactive docs (OpenAPI): http://localhost:8000/docs

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

### `GET /word-data`

Fetch the entry by `word` and `lang_code`.

Example: `/word-data?word=tea&lang_code=en`

Query params: `word` (string), `lang_code` (string, e.g., `en`)

### `GET /available-languages`

List language codes available for a given `word`.

Example: `/available-languages?word=tea`

### `GET /random-interesting-word`

Returns a random entry from one of the precomputed categories: longest words, most translations, or most descendants.

### `GET /ancestry-chain`

Returns a linear ancestry chain for timeline visualization.

Example: `/ancestry-chain?word=tea&lang_code=en`

### `GET /phonetic-drift-detailed`

Returns segment alignment and feature changes between two IPA strings.

Example: `/phonetic-drift-detailed?ipa1=/tiː/&ipa2=/te/`

### `GET /descendant-tree`

Builds a descendant hierarchy starting from the given word.

Example: `/descendant-tree?word=tea&lang_code=en`

### `GET /descendant-tree-from-root`

Builds a descendant hierarchy given a root form and language code.

Example: `/descendant-tree-from-root?word=proto-form&lang_code=la`

---

## 🐳 Docker (Recommended for portability)

You can run the backend in a container. This keeps dependencies isolated and lets you ship the service easily.

### Build and run with Docker directly

1. Build the image

  ```bash
  docker build -t wiktionaryviz-backend ./backend
  ```

2. Run the container (mounting host data so large files stay outside the image)

  ```bash
  docker run --name wiktionaryviz-backend \
    -p 8000:8000 \
    -e OPENAI_API_KEY=$OPENAI_API_KEY \
    -v "$(pwd)/backend/data:/app/data" \
    wiktionaryviz-backend
  ```

The API will be available at:

http://localhost:8000

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

Option A (convenience script):

```bash
API=https://api.example.com npm run deploy:api
```

Option B (set Vite env directly):

```bash
API_BACKEND=https://api.example.com npm run deploy
```

### GitHub Actions

- Backend image build: `.github/workflows/backend-docker.yml`
- Frontend deploy with `API_BACKEND` secret: `.github/workflows/frontend-deploy.yml`

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
