# [WiktionaryViz](https://vialab.github.io/WiktionaryViz/ "vialab.github.io/WiktionaryViz")

An explorative visual analytics tool for linguistics based upon Wiktionary

[![Website](https://img.shields.io/website?label=vialab.github.io/WiktionaryViz&style=for-the-badge&url=https%3A%2F%2Fvialab.github.io/WiktionaryViz)](https://vialab.github.io/WiktionaryViz/)
![GitHub repo size](https://img.shields.io/github/repo-size/vialab/WiktionaryViz?style=for-the-badge)
![GitHub](https://img.shields.io/github/license/vialab/WiktionaryViz?style=for-the-badge)

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