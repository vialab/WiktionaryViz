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

Stop with:

```bash
docker compose down
```

### Notes for production

- Serve the backend behind HTTPS (reverse proxy like Nginx/Caddy or a managed platform) to avoid mixed-content when your frontend is on HTTPS.
- Restrict CORS origins in `main.py` for production.

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
