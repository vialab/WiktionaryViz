<div align="center">

# WiktionaryViz

Interactive visual analytics over large-scale Wiktionary (Wiktextract) data: etymology lineages, descendant networks, phonological drift, translations, and notable lexical statistics.

[Live Demo](https://vialab.github.io/WiktionaryViz/) • MIT License

![GitHub repo size](https://img.shields.io/github/repo-size/vialab/WiktionaryViz?style=flat) ![License](https://img.shields.io/github/license/vialab/WiktionaryViz?style=flat) ![Release](https://img.shields.io/github/v/release/vialab/WiktionaryViz?include_prereleases&label=version)

</div>

> Status: Active early development (0.x). Backward‑incompatible changes may occur. Several backend endpoints are presently stubs / incomplete; see Roadmap & API notes below.

---

## Table of Contents

1. Overview
2. Core Features (Current)
3. Roadmap (Planned / Incomplete)
4. Architecture & Data Flow
5. Tech Stack
6. Data Source & Indexing
7. Quick Start
8. Detailed Local Development
9. Environment Variables
10. Docker & Container Usage
11. API Reference (Current State)
12. Frontend Build & Deployment (GitHub Pages)
13. CI / Release Automation
14. Performance Notes
15. Troubleshooting
16. Contributing Guidelines
17. License & Attribution
18. Security / Responsible Use

---

## 1. Overview

WiktionaryViz is a full‑stack exploratory tool for investigating lexical evolution and relationships across languages. It consumes the large Wiktextract JSONL dump (20GB+ uncompressed) and provides interactive visualizations: timelines of ancestry, descendant trees, geographic distributions, and phonetic drift inspection using articulatory feature distances.

The design emphasizes:
* Zero/low preprocessing beyond an offset index for near O(1) random access into a memory‑mapped JSONL file.
* Progressive visual exploration (lineage, radial trees, geospatial views, temporal ancestry chain).
* Reproducible, containerized backend + static frontend deployable on GitHub Pages plus a hosted API.

---

## 2. Core Features (Current)

Frontend (React + Vite):
* Radial & network lineage visuals (D3)
* Timeline ancestry chain UI (with carousel & metadata panels)
* Leaflet geospatial layer (country highlights, translation markers, lineage overlays)
* Interesting word suggestion component (UI stub; backend randomized endpoint not yet wired)
* Export GeoJSON utilities (client side)

Backend (FastAPI — current implemented basis):
* Descendant tree endpoint skeleton (`/descendant-tree`) using on-demand mmap access
* Phonological feature alignment utilities (PanPhon)
* Alignment cost framework (insert/delete/feature diff) via dynamic programming
* Docker image build & multi‑arch publish to GHCR

Tooling / Infra:
* GitHub Actions: frontend deploy (gh-pages), backend Docker build, release automation (Release Please)
* Release versioning & changelog generation (prerelease semantics for 0.x)
* Strict TypeScript + ESLint + Prettier configuration
* Docker entrypoint auto‑downloads compressed Wiktextract dataset (overrideable)

---

## 3. Roadmap (Planned / Incomplete)

These are visible as TODOs in code; not yet production‑ready:
* Complete `word_data` endpoints: `GET /word-data`, `GET /available-languages`, `GET /random-interesting-word`
* Rich descendant hierarchy weighting (`max_depth`, `min_strength` parameters)
* Phonetic drift detailed endpoint completion (`/phonetic-drift-detailed` currently partial) + compact drift score endpoint
* AI augmentations: IPA estimation & filter suggestions (OpenAI integration placeholders)
* KWIC concordance endpoint with pagination & highlighting
* User corpus upload endpoints
* Additional Hall‑of‑Fame statistics in `build_index.py` (currently stubbed)
* Index auto-build & regeneration logic (currently only loader; builder is skeletal)
* Tests (unit + integration + snapshot for visuals)
* Accessibility & i18n improvements

---

## 4. Architecture & Data Flow

High-level pipeline:
1. Data Acquisition: Entry script downloads (or mounts) `wiktionary_data.jsonl` (raw Wiktextract output or gz variant).
2. Index: A JSON index (`wiktionary_index.json`) maps `word_lang` keys to byte offsets; loaded at FastAPI startup. (Builder not fully implemented yet.)
3. Backend Access Pattern: When an endpoint needs a word entry, it seeks to the byte offset and reads a single JSON line from the mmap’d file.
4. Feature Analysis: PanPhon feature tables compute pairwise segment feature differences for phonological alignment.
5. Frontend Consumption: The frontend calls the backend REST API; environment variable `API_BACKEND` is embedded at build time for deployed static assets.
6. Visualization: D3 + React + Leaflet transform structured data (lineage arrays, descendant tree JSON, geospatial metadata) into interactive components.

Directory highlights:
* `backend/` – FastAPI app, services, data constants, Docker build.
* `src/components/` – Page components & visualization modules (`geospatial`, `network`, `timeline`).
* `src/hooks/` – Data fetching & caching hooks.
* `src/types/` – TS domain models (etymology, languoid metadata).
* `src/utils/` – API base URL resolution, export helpers, mapping utilities.

---

## 5. Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 19, TypeScript, Vite, D3, Leaflet, Tailwind (via `@tailwindcss/vite`) |
| Backend | FastAPI, Uvicorn, mmap-based random access, PanPhon |
| Packaging | Docker (multi-arch), GitHub Container Registry |
| CI/CD | GitHub Actions (frontend deploy, backend image build, release-please) |
| Language Data | Wiktextract JSONL dump (20GB+ uncompressed) |

---

## 6. Data Source & Indexing

Default dataset URL (override with `WIKTIONARY_DATA_URL`):
```
https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
```

Characteristics:
* Large newline-delimited JSON; each line = lexical entry (word + language + senses + etymology + descendants ...)
* Access strategy: maintain mapping `"{word}_{lang_code}" -> [byte_offset, optional_metadata]` enabling direct seek.

Current Limitations:
* `build_index.py` is a scaffold; advanced statistics & index regeneration logic incomplete.
* Some Hall-of-Fame JSON summaries exist (`longest_words.json`, `most_translations.json`, `most_descendants.json`) but building script requires completion.

Planned improvements:
* Incremental indexing for partial dataset updates
* Derived metrics (phonological complexity, borrowing density, time depth)
* On-demand caching & eviction strategies

---

## 7. Quick Start

Choose one of the following:

### A) Run Everything (Frontend + Backend) Locally
```bash
git clone https://github.com/vialab/WiktionaryViz.git
cd WiktionaryViz

# Frontend deps
npm install

# Backend (Python 3.11 recommended)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Start backend (will download dataset unless mounted / skipped)
npm run backend   # or: uvicorn main:app --reload --host 0.0.0.0 --port 8000 (inside backend/)

# In a second terminal: start frontend
npm run dev
```
Visit: http://localhost:5173 (Vite default). Set `API_BACKEND` at build time for production (see Env Vars).

### B) Docker Compose (Backend only + external static site)
```bash
docker compose up --build -d
```
Backend exposed at `http://localhost:8000`.

### C) Use Published Backend Image
```bash
docker run -p 8000:8000 \
  -e WIKTIONARY_DATA_URL=https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz \
  -e ALLOWED_ORIGINS=* \
  ghcr.io/vialab/wiktionaryviz-backend:latest
```

### D) Static Frontend Preview
```bash
npm run build
npm run preview
```

---

## 8. Detailed Local Development

Scripts (see `package.json`):
* `npm run dev` – Frontend dev server
* `npm run backend` – Uvicorn backend (reload)
* `npm run dev:full` – Concurrent frontend + backend
* `npm run build` – TypeScript build + Vite production bundle
* `npm run lint` / `npm run format` – Code quality
* `npm run backend:up` / `npm run backend:down` – Compose lifecycle

Recommended Node: v20.x (GitHub Actions matches). Recommended Python: 3.11 (Docker base).

Code Quality:
* ESLint + TypeScript strictness (unused vars, params disallowed) 
* Prettier enforced (see `.prettierrc`)
* Consider running `npm run format:check` in CI if adding test workflows.

---

## 9. Environment Variables

| Variable | Target | Required? | Default | Purpose |
|----------|--------|-----------|---------|---------|
| `API_BACKEND` | Frontend build | Yes (deploy) | empty | Absolute base URL to backend API baked into bundle. |
| `ALLOWED_ORIGINS` | Backend | Optional | `*` | CORS origins (comma-separated). |
| `PORT` | Backend | Optional | `8000` | Uvicorn port. |
| `OPENAI_API_KEY` | Backend | Optional | none | Future AI augmentation (IPA estimation, suggestions). Not yet invoked. |
| `WIKTIONARY_DATA_URL` | Backend | Optional | Kaikki gz URL | Dataset source. |
| `SKIP_DOWNLOAD` | Backend | Optional | `0` | If `1`, skip auto dataset download. |

Runtime overrides (Docker): use `-e VAR=value`.

---

## 10. Docker & Container Usage

Multi-arch images built by CI and pushed to GHCR: `ghcr.io/vialab/wiktionaryviz-backend:latest`.

Features:
* Non-root user execution
* Layer-cached dependencies (`requirements.txt` first)
* Streaming download & unzip of dataset on first start
* Healthcheck (compose) hitting root endpoint

Persist data volume to avoid re-download:
```yaml
volumes:
  wiktionary-data:
services:
  backend:
    volumes:
      - wiktionary-data:/app/data
```

---

## 11. API Reference (Current State)

> IMPORTANT: Several endpoints are INCOMPLETE or PARTIAL. This section lists what exists in source; production consumers should gate usage.

Base URL: `http://<host>:8000`

### Implemented / Partial
| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/` | minimal | Root health placeholder. |
| GET | `/descendant-tree?word=<w>&lang_code=<l>` | partial | Builds hierarchy from word entry; descendant traversal logic incomplete (missing recursive fill & imports). Returns error if word absent. |
| GET | `/ancestry-chain?word=<w>&lang_code=<l>` | stub | Calls `build_ancestry_chain` (not yet implemented). |
| GET | `/phonetic-drift-detailed?ipa1=<>&ipa2=<>` | stub | Loop skeleton present; response not returned. |

### Declared (Not Implemented Yet)
| Method | Path | Planned Function |
|--------|------|------------------|
| GET | `/word-data` | Return lexical entry + computed stats / AI supplement. |
| GET | `/available-languages` | List languages containing a given word form. |
| GET | `/random-interesting-word` | Sample from precomputed interesting words. |
| Future | `/phonetic-drift` | Compact drift score only. |
| Future | `/compare` | Compare two words' ancestry & phonological drift. |
| Future | Multiple `/ai/*` | Exploration filter suggestions. |
| Future | `/kwic` | Key Word In Context examples. |

### Error Handling
* 404 when key missing from index (implemented in descendants endpoint).
* 500 generic JSON errors for unexpected exceptions.

### Notes
* `index` loading occurs in `constants.load_index()` (should be invoked at startup — ensure lifecycle hook wires it in when refactoring lifespan context).
* Memory mapping occurs per-request rather than persistent global mapping; future optimization: pool or keep-open.

---

## 12. Frontend Build & Deployment (GitHub Pages)

Workflow (`frontend-deploy.yml`):
1. Triggered on pushes to `main` affecting frontend files.
2. Installs Node deps (`npm ci` if lock present).
3. Builds with `API_BACKEND` secret injected.
4. Publishes `dist/` to `gh-pages` branch using James Ives action.

Local Production Build:
```bash
API_BACKEND=https://your-backend.example.org npm run build
```
Result served from `dist/`. GitHub Pages base path set via `vite.config.ts` (`base: '/WiktionaryViz/'`).

---

## 13. CI / Release Automation

GitHub Actions Workflows:
* `release-please.yml` – Automates version bumps, changelog PRs, prerelease tagging.
* `frontend-deploy.yml` – Builds & deploys static site to `gh-pages`.
* `backend-docker.yml` – Builds multi-arch backend image and pushes to GHCR with commit SHA + `latest` tag.

Release Strategy:
* 0.x: minor increments may include breaking changes; patch used for smaller features/fixes (configured via release-please settings `bump-minor-pre-major`).

---

## 14. Performance Notes

Initial Targets / Assumptions:
* Lookup: O(1) file seek + single line decode.
* Alignment: DP cost ~ O(n*m) for segment lengths; typical IPA forms are short (<30 segments).
* Cold start: dataset download + (future) index build are the heaviest operations.

Planned Optimizations:
* Persistent mmap handle reused across requests.
* Index compression & memory mapping of index file.
* Cython / Rust modules for alignment (if profiling warrants).

---

## 15. Troubleshooting

| Symptom | Possible Cause | Fix |
|---------|----------------|-----|
| Backend 404 for valid word | Index missing / not loaded | Ensure `wiktionary_index.json` exists & `load_index()` called at startup. |
| Large delay on first run | Dataset download/unzip | Set `SKIP_DOWNLOAD=1` if volume already has file. |
| CORS errors in browser | `ALLOWED_ORIGINS` misconfigured | Set env to `*` or include site origin. |
| Frontend shows empty visualizations | API endpoint stubs returning nothing | Implement endpoints or guard fetch calls. |
| Docker memory pressure | Large JSONL | Allocate sufficient container memory or prune dataset variants. |

---

## 16. Contributing Guidelines

1. Fork & branch from `main` (e.g., `feat/descendant-weights`).
2. Keep PRs focused; reference open issues or create one if needed.
3. Run lint & format before pushing (`npm run lint && npm run format:check`).
4. Add / update documentation for new endpoints or data fields.
5. Avoid committing large data files; rely on download mechanism or volumes.
6. For new APIs: document in README (API section) + add minimal test (when test harness introduced).
7. Release process is automated—do not manually edit `CHANGELOG.md`; rely on conventional commit messages (e.g., `feat(descendants): add depth limiting`).

Suggested Conventional Commit Scopes: `frontend`, `backend`, `descendants`, `phonology`, `timeline`, `geospatial`, `build`, `ci`, `docs`.

---

## 17. License & Attribution

* License: MIT (see `LICENSE`).
* Data: Derived from Wiktionary via [Wiktextract](https://github.com/tatuylonen/wiktextract) / Kaikki.org. Wiktionary content is available under CC-BY-SA 3.0 and GFDL; ensure compliance when redistributing processed derivatives.
* Phonological features: [PanPhon](https://github.com/kaepora/panphon).

When publishing analyses, consider citing Wiktionary + Wiktextract + PanPhon.

---

## 18. Security / Responsible Use

* No authentication layer presently; deploy behind a gateway or restrict origins for production.
* Avoid exposing full raw dataset publicly if local policy requires attribution banners / license notices.
* AI augmentation (planned) must not leak proprietary keys or unfiltered raw user input; validate before enabling.

---

### Roadmap Snapshot (Concise)
```
[ ] Complete core endpoints (word data, available languages, random interesting word)
[ ] Finish descendant hierarchy recursion & depth limiting
[ ] Implement phonetic drift detailed + compact endpoints
[ ] Index builder & advanced stats
[ ] AI filter suggestion + IPA estimation
[ ] KWIC + compare endpoints
[ ] Test suite (Pytest + frontend component tests)
[ ] Persistent mmap & performance profiling
```

---

### Disclaimer
This repository is an academic / exploratory tool; accuracy of descendant or etymology chains depends on source data quality. Always corroborate results with primary linguistic sources for scholarly work.

---

Enjoy exploring lexical evolution ✨

— The WiktionaryViz Team


Backend (FastAPI)
- mmap random access over huge JSONL
- Precomputed stats (longest words, most translations, most descendants)
- Phonetic alignment & drift (PanPhon)
- Descendant tree + lineage chain APIs
- Optional AI-assisted IPA estimation (OpenAI key)

## 3. Architecture

```text
Frontend (Vite, React, D3, Leaflet) <--HTTP--> FastAPI Backend
                             │
                             ├─ mmap(wiktionary_data.jsonl)
                             ├─ wiktionary_index.json (word+lang → byte offset)
                             └─ Precomputed stats JSON files
```

## 4. Prerequisites

- Node.js 18+ (npm or pnpm)
- Python 3.9+ (if running backend locally without Docker)
- Docker + Docker Compose (recommended for backend)
- ~40GB free disk (download + uncompressed + indices overhead)

## 5. Quick Start (60‑second guide)

```bash
# 1. Start backend (Docker)
npm run backend:up

# 2. Start frontend
npm run dev

# (Optional) For external HTTPS exposure use your own reverse proxy (Nginx/Caddy) or hosting platform.
```

Visit <http://localhost:5173> (default Vite dev) and ensure `API_BACKEND` points to your backend (see section 7/8).

## 6. Development Workflow

Install dependencies:

```bash
npm install
```

Run only frontend:

```bash
npm run dev
```

Run backend locally without Docker:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Or via root script (after venv setup):

```bash
npm run backend
```

Run both concurrently (frontend + local backend):

```bash
npm run dev:full
```

Frontend → Backend base URL

1. Create `.env` at repo root:

  ```bash
  API_BACKEND=http://localhost:8000
  ```

1. For a one-off build/deploy you can also use `API=` which maps to `API_BACKEND` in scripts:

  ```bash
  API=https://api.example.com npm run deploy:api
  ```

## 7. Data & Indexing

Files (in `backend/data/` by default):

- `wiktionary_data.jsonl` (raw dump; auto-downloaded in Docker unless skipped)
- `wiktionary_index.json` (word+lang → byte offset)
- `longest_words.json`, `most_translations.json`, `most_descendants.json`

Build/rebuild index & stats (run after replacing dataset):

```bash
cd backend
python build_index.py
```

How it works:

1. Stream JSONL, record file offsets per `{word,lang_code}` key.
2. Serialize index to JSON (loaded fully at startup—small compared to dataset).
3. Use `mmap` + `seek` for O(1) retrieval of an entry line.

## 8. Environment Variables

Frontend (build time):

- `API_BACKEND` – Base URL for all API calls.

Backend:

- `PORT` (default 8000)
- `ALLOWED_ORIGINS` (comma list, or `*` for all; `*` disables credentials)
- `WIKTIONARY_DATA_URL` (defaults to Kaikki.org `.gz`)
- `SKIP_DOWNLOAD=1` to skip auto fetch in Docker
- `OPENAI_API_KEY` (optional; IPA estimation)

Convenience scripts also accept `API=` (forwarded to `API_BACKEND`).

## 9. API Summary

Base: `http://localhost:8000` (dev) – Docs at `/docs`.

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `/` | Health | GET `/` |
| `/word-data` | Entry lookup | `?word=tea&lang_code=en` |
| `/available-languages` | Languages for word | `?word=tea` |
| `/random-interesting-word` | Random from stats | – |
| `/ancestry-chain` | Linear lineage | `?word=tea&lang_code=en` |
| `/phonetic-drift-detailed` | Phonetic alignment | `?ipa1=/tiː/&ipa2=/te/` |
| `/descendant-tree` | Descendants from a word | `?word=tea&lang_code=en` |
| `/descendant-tree-from-root` | Tree from proto/root | `?word=proto-form&lang_code=la` |

## 10. Docker

Run backend container:

```bash
docker compose up --build
```

Stop:

```bash
docker compose down
```

Auto dataset bootstrap (inside container): If `wiktionary_data.jsonl` is missing, it downloads & decompresses before serving.

To purge data volume:

```bash
docker volume rm wiktionary-data
```

## 11. Build & Deploy (GitHub Pages + custom API)

Build only with injected API:

```bash
API=https://your-backend.example.com npm run build:api
```

Deploy to GitHub Pages (sets correct `base` in Vite config):

```bash
API=https://your-backend.example.com npm run deploy:api
```

## 12. CI

GitHub Actions (examples):

- Backend Docker image build: `.github/workflows/backend-docker.yml`
- Frontend deploy: `.github/workflows/frontend-deploy.yml`

Add registry credentials (secrets) to push images if desired.

## 13. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Frontend hits own origin paths (404) | `API_BACKEND` not set at build | Rebuild with `API_BACKEND` or `API` env |
| Mixed content blocked | HTTPS frontend → HTTP backend | Serve backend over HTTPS (reverse proxy / platform) |
| CORS error | Origins mismatch | Set `ALLOWED_ORIGINS` to include frontend origin |
| Empty / 404 word lookups | Dataset not downloaded / index missing | Wait for first download or rebuild index |
| Slow first start | Large download & index build | Allow completion or pre-seed volume |

## 14. Contributing & License

PRs and issues welcome—keep changes focused, document new endpoints, run `npm run lint` before submitting.

License: MIT © Visualization for Information Analysis Lab. See [`LICENSE`](./LICENSE).

---

Historical note: The backend-specific README has been folded into this unified document for simplicity.
