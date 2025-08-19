# [WiktionaryViz](https://vialab.github.io/WiktionaryViz/ "vialab.github.io/WiktionaryViz")

Interactive visual analytics for exploring etymology, phonology, descendants, and translations using Wiktionary data.

[![Website](https://img.shields.io/website?label=vialab.github.io/WiktionaryViz&style=for-the-badge&url=https%3A%2F%2Fvialab.github.io/WiktionaryViz)](https://vialab.github.io/WiktionaryViz/)
![GitHub repo size](https://img.shields.io/github/repo-size/vialab/WiktionaryViz?style=for-the-badge)
![GitHub](https://img.shields.io/github/license/vialab/WiktionaryViz?style=for-the-badge)

WiktionaryViz consists of a React + Vite frontend and a FastAPI backend that serves data from a large JSONL dump via an mmap-backed index for fast lookups.

• Live demo: https://vialab.github.io/WiktionaryViz/

## Prerequisites

- Node.js 18+ and npm (or pnpm)
- For backend via Docker: Docker + Docker Compose
- For backend without Docker: Python 3.9+, pip
- Data: the backend will auto-download the Wiktionary JSONL (20GB+ uncompressed) on first run by default.

## Quick Start

1. Backend (Docker, recommended for dev):

```bash
npm run backend:up
```

2. Frontend (local dev):

```bash
npm run dev
```

3. Optional Cloudflare dev tunnel (HTTPS for your backend):

```bash
# Start the dev-only tunnel service (compose profile: dev)
docker compose --profile dev up -d tunnel
docker compose logs -f tunnel # copy the trycloudflare.com URL
```

4. Deploy frontend (GitHub Pages) pointing to your backend:

```bash
API=https://your-backend.example.com npm run deploy:api
```

## Development

- Install Node.js and dependencies:

```bash
npm install
```

- Start frontend:

```bash
npm run dev
```

- Start backend (Python FastAPI) without Docker (requires Python and pip):

```bash
# one-time in another shell
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# then, from repo root
npm run backend
```

- To run both concurrently:

```bash
npm run dev:full
```

### Frontend → Backend connection

- The frontend reads `API_BACKEND` at build/dev time. Create a `.env` in the repo root (based on `.env.example`) and set the backend URL:

```bash
API_BACKEND=http://localhost:8000
```

- For GitHub Pages, set `API_BACKEND` at build time to your public backend URL (e.g., `https://api.example.com`). Ensure your backend has CORS enabled for your GitHub Pages origin.

- Convenience scripts also accept `API` and forward it to `API_BACKEND`:

```bash
# Build only
API=https://api.example.com npm run build:api
# Deploy to GitHub Pages
API=https://api.example.com npm run deploy:api
```

### Dockerized backend

- To run the backend via Docker Compose from the repo root:

```bash
docker compose up --build
```

By default, the container manages its own data in `/app/data` and will auto-download the dataset if missing (see env vars below). Data persists across container recreation via a named volume declared in `docker-compose.yml`.

To remove persisted data, delete the `wiktionary-data` Docker volume.

## Scripts (dev vs prod)

- Start/stop backend (Docker Compose):

```bash
npm run backend:up
npm run backend:down
```

- Quick Cloudflare tunnel for dev (ephemeral URL):

```bash
docker compose --profile dev up -d tunnel
docker compose logs -f tunnel # copy the trycloudflare.com URL
```

- Build/deploy frontend with a specific backend API URL:

```bash
# Build only
API=https://your-backend.example.com npm run build:api

# Deploy to GitHub Pages with API injected
API=https://your-backend.example.com npm run deploy:api
```

## Project structure

```text
.
├── src/                     # React + Vite frontend (D3, Leaflet, Tailwind)
├── backend/                 # FastAPI backend
│   ├── api_routes/          # API route modules
│   ├── data/                # wiktionary_data.jsonl + generated indices/stats
│   ├── services/            # PanPhon alignment, IO helpers
│   └── requirements.txt
├── docker-compose.yml       # Backend + dev-only Cloudflare tunnel
├── vite.config.ts           # Frontend build config (base /WiktionaryViz/)
└── package.json             # Scripts for dev/deploy
```

## CI (GitHub Actions)

- Backend Docker build: `.github/workflows/backend-docker.yml`
	- Builds the backend image on pushes to `main` when backend files change.
	- To push to a registry, add secrets and enable login in the workflow (Docker Hub or GHCR).

## Configuration

Environment variables used across the project:

- Frontend
	- `API_BACKEND`: Base URL for backend API (e.g., `https://api.example.com`). Used at build time.

- Backend
	- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins (e.g., `https://vialab.github.io`).
	- `OPENAI_API_KEY` (optional): Enables AI IPA estimation when needed.
	- `PORT` (optional): Backend port (defaults to 8000).
	- `WIKTIONARY_DATA_URL` (optional): URL to download the dataset on first run. Supports `.gz` or plain `.jsonl`. Defaults to Kaikki.org `.gz`.
	- `SKIP_DOWNLOAD` (optional): Set to `1` to skip auto-download. Default `0`.

## Backend API

- FastAPI app runs on `http://localhost:8000` by default.
- Interactive API docs: `http://localhost:8000/docs`
- Common endpoints:
	- `GET /word-data?word=tea&lang_code=en`
	- `GET /available-languages?word=tea`
	- `GET /random-interesting-word`
	- `GET /ancestry-chain?word=tea&lang_code=en`
	- `GET /phonetic-drift-detailed?ipa1=/tiː/&ipa2=/te/`
	- `GET /descendant-tree?word=tea&lang_code=en`
	- `GET /descendant-tree-from-root?word=proto-form&lang_code=la`

## Troubleshooting

- Requests hitting GitHub Pages path (e.g., `/random-interesting-word`) instead of backend:
	- Rebuild/deploy frontend with `API_BACKEND` set to your backend URL.

- Mixed content blocked (HTTPS page calling HTTP backend):
	- Use HTTPS backend (Cloudflare tunnel or your own TLS).

- CORS errors:
	- Set `ALLOWED_ORIGINS=https://vialab.github.io` and restart backend.

- No data or 404 for entries:
	- If running locally without Docker, ensure `backend/data/wiktionary_data.jsonl` exists. In Docker, allow time for download and index build on first run.

## Contributing

Issues and pull requests are welcome. Please:

- Keep changes focused and documented.
- Run `npm run lint` for frontend changes; follow existing code style.
- When touching the backend, update docs for any new endpoints.

## License

MIT © Visualization for Information Analysis Lab. See [`LICENSE`](./LICENSE).