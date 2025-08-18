# [WiktionaryViz](https://vialab.github.io/WiktionaryViz/ "vialab.github.io/WiktionaryViz")

An explorative visual analytics tool for linguistics based upon Wiktionary

[![Website](https://img.shields.io/website?label=vialab.github.io/WiktionaryViz&style=for-the-badge&url=https%3A%2F%2Fvialab.github.io/WiktionaryViz)](https://vialab.github.io/WiktionaryViz/)
![GitHub repo size](https://img.shields.io/github/repo-size/vialab/WiktionaryViz?style=for-the-badge)
![GitHub](https://img.shields.io/github/license/vialab/WiktionaryViz?style=for-the-badge)

## Quick Start

1. Backend (Docker):

```bash
npm run backend:up
```

2. Frontend (local dev):

```bash
npm run dev
```

3. Optional Cloudflare dev tunnel (HTTPS):

```bash
npm run tunnel:up
npm run tunnel:logs # copy the trycloudflare.com URL
```

4. Deploy frontend (GitHub Pages) pointing to your backend:

```bash
API=https://your-backend.example.com npm run deploy:api
```

## Development

- Install Node.js 18+ and pnpm/npm.
- Install deps:

```bash
npm install
```

- Start frontend:

```bash
npm run dev
```

- Start backend (Python FastAPI):

```bash
npm run backend
```

- To run both:

```bash
npm run dev:full
```

### Frontend → Backend connection

- The frontend reads `VITE_API_BASE` to construct API requests. Create a `.env` file in the repo root (based on `.env.example`) and set the backend URL:

```bash
VITE_API_BASE=http://localhost:8000
```

- For GitHub Pages, set `VITE_API_BASE` at build time to your public backend URL (e.g. `https://api.example.com`). Ensure your backend has CORS enabled for your GitHub Pages origin.

### Dockerized backend

- To run the backend via Docker Compose from the repo root:

```bash
docker compose up --build
```

This mounts `./backend/data` into the container. Place `wiktionary_data.jsonl` there; the app will generate or reuse the index.

## Scripts (dev vs prod)

- Start/stop backend (Docker Compose):

```bash
npm run backend:up
npm run backend:down
```

- Quick Cloudflare tunnel for dev (ephemeral URL):

```bash
npm run tunnel:up
npm run tunnel:logs # copy the trycloudflare.com URL
```

- Build/deploy frontend with a specific backend API URL:

```bash
# Build only
API=https://your-backend.example.com npm run build:api

# Deploy to GitHub Pages with API injected
API=https://your-backend.example.com npm run deploy:api
```

## CI (GitHub Actions)

- Backend Docker build: `.github/workflows/backend-docker.yml`
	- Builds the backend image on pushes to `main` when backend files change.
	- To push to a registry, add secrets and enable login in the workflow (Docker Hub or GHCR).

- Frontend deploy: `.github/workflows/frontend-deploy.yml`
	- Builds the frontend with `VITE_API_BASE` from the repository secret `VITE_API_BASE`.
	- Deploys with `gh-pages`.

Recommended secrets:

- `VITE_API_BASE` — public HTTPS URL of your backend for production builds.
- (Optional) `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` or GHCR equivalents if you want to publish backend images.

## Configuration

Environment variables used across the project:

- Frontend
	- `VITE_API_BASE`: Base URL for backend API (e.g., `https://api.example.com`). Used at build time.

- Backend
	- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins (e.g., `https://vialab.github.io`).
	- `OPENAI_API_KEY` (optional): Enables AI IPA estimation when needed.
	- `PORT` (optional): Backend port (defaults to 8000).
	- `TUNNEL_TOKEN` (named Cloudflare tunnel): Used by `tunnel-named` service.
	- `WIKTIONARY_DATA_URL` (optional): URL to download the dataset on first run. Supports `.gz` or plain `.jsonl`. Defaults to Kaikki.org `.gz`.
	- `SKIP_DOWNLOAD` (optional): Set to `1` to skip auto-download. Default `0`.

## Troubleshooting

- Requests hitting GitHub Pages path (e.g., `/random-interesting-word`) instead of backend:
	- Rebuild/deploy frontend with `VITE_API_BASE` set to your backend URL.

- Mixed content blocked (HTTPS page calling HTTP backend):
	- Use HTTPS backend (Cloudflare tunnel or your own TLS).

- CORS errors:
	- Set `ALLOWED_ORIGINS=https://vialab.github.io` and restart backend.

- No data or 404 for entries:
	- Ensure `backend/data/wiktionary_data.jsonl` exists and allow time for index build on first run.