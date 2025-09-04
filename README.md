# WiktionaryViz

An interactive linguistic visual analytics tool for exploring language and word evolution over large-scale Wiktionary (Wiktextract) data.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-online-brightgreen?&logoColor=white&style=for-the-badge)](https://vialab.github.io/WiktionaryViz/)

![GitHub repo size](https://img.shields.io/github/repo-size/vialab/WiktionaryViz?style=flat-square) ![License](https://img.shields.io/github/license/vialab/WiktionaryViz?style=flat-square) ![Release](https://img.shields.io/github/v/release/vialab/WiktionaryViz?include_prereleases&label=version&style=flat-square)

> Status: Early 0.x development. Public APIs and data formats may change without notice.

## Disclaimer

This is an academic research / exploratory tool. Visualization accuracy depends on source data quality.

---

## Table of Contents

- [WiktionaryViz](#wiktionaryviz)
  - [Disclaimer](#disclaimer)
  - [Table of Contents](#table-of-contents)
  - [1. Overview](#1-overview)
  - [2. Architecture \& Data Flow](#2-architecture--data-flow)
  - [3. Prerequisites](#3-prerequisites)
  - [4. Tech Stack](#4-tech-stack)
  - [5. Data Source \& Indexing](#5-data-source--indexing)
  - [6. Quick Start](#6-quick-start)
    - [A. Full Local (Frontend + Backend)](#a-full-local-frontend--backend)
    - [B. Docker Compose (Backend only)](#b-docker-compose-backend-only)
    - [C. Run Published Backend Image](#c-run-published-backend-image)
    - [D. Static Frontend Preview](#d-static-frontend-preview)
  - [7. Local Development](#7-local-development)
  - [8. Environment Variables](#8-environment-variables)
  - [9. Docker Usage](#9-docker-usage)
  - [10. API Reference](#10-api-reference)
  - [11. Frontend Build \& Deployment](#11-frontend-build--deployment)
  - [12. CI / Release Automation](#12-ci--release-automation)
  - [13. Troubleshooting](#13-troubleshooting)
  - [14. Contributing](#14-contributing)
  - [15. License \& Attribution](#15-license--attribution)
  - [16. Security / Responsible Use](#16-security--responsible-use)

---

## 1. Overview

WiktionaryViz lets you explore lexical evolution: ancestry timelines, descendant trees, geographic distributions, and phonetic drift (feature-based IPA alignment). It streams from a large Wiktextract JSONL dump (20GB+ uncompressed) via byte‑offset indexing for near O(1) random access.

Design principles:

* Minimal preprocessing (just an index + small derived stats files)
* Progressive disclosure visualizations (timeline, radial, network, map)
* Reproducible containerized backend + static frontend deployable to GitHub Pages

## 2. Architecture & Data Flow

1. Acquire dataset (`wiktionary_data.jsonl[.gz]`) from Kaikki.org.
2. Build offset index + stats (`wiktionary_index.json`, `most_*`, etc.).
3. FastAPI loads index at startup; endpoints mmap the JSONL and seek directly.
4. Services layer supplies ancestry + descendant traversal + phonetic alignment.
5. Frontend fetches REST endpoints; data transformed via D3/Leaflet into visuals.

Key directories:

* `backend/` – FastAPI app, index builder, services
* `src/components/` – Visualization & page components
* `src/hooks/` – Data fetching + caching hooks
* `src/types/` – TypeScript domain models
* `src/utils/` – API base, export & mapping utilities

## 3. Prerequisites

* Node.js 18+ (20.x recommended)
* Python 3.11 recommended (>=3.9 minimum for local non-Docker)
* Docker + Docker Compose (for container workflow)
* ~40GB free disk (compressed + uncompressed + indices)

## 4. Tech Stack

| Layer     | Technologies                                          |
| --------- | ----------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite, D3, Leaflet, Tailwind     |
| Backend   | FastAPI, Uvicorn, mmap random access, PanPhon         |
| Packaging | Docker (multi-arch), GitHub Container Registry        |
| CI/CD     | GitHub Actions (deploy, release-please, Docker build) |
| Data      | Wiktextract JSONL dump (Kaikki.org)                   |

## 5. Data Source & Indexing

Default dataset URL (override `WIKTIONARY_DATA_URL`):

```text
https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
```

Index build (after dataset present):

```bash
cd backend
python build_index.py
```

Artifacts (in `backend/data/`):

* `wiktionary_data.jsonl` – Raw dump (auto-downloaded if not skipped)
* `wiktionary_index.json` – `{word_lang_code: [byte_offset, ...]}` mapping
* `longest_words.json`, `most_translations.json`, `most_descendants.json`

Retrieval strategy: `mmap` + `seek` to recorded offset, read one JSON line, parse on demand.

## 6. Quick Start

### A. Full Local (Frontend + Backend)

```bash
git clone https://github.com/vialab/WiktionaryViz.git
cd WiktionaryViz
npm install
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ..
npm run backend   # starts FastAPI (downloads dataset if needed)
# separate terminal
npm run dev       # starts Vite dev server
```

Open <http://localhost:5173>

### B. Docker Compose (Backend only)

```bash
docker compose up --build -d
```

Backend at <http://localhost:8000>

### C. Run Published Backend Image

```bash
docker run -p 8000:8000 \
  -e WIKTIONARY_DATA_URL=https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz \
  -e ALLOWED_ORIGINS=* \
  -e OPENAI_API_KEY=<your-openai-key> \
  ghcr.io/vialab/wiktionaryviz-backend:latest
```

### D. Static Frontend Preview

```bash
npm run build
npm run preview
```

## 7. Local Development

Core scripts (`package.json`):

* `npm run dev` – Frontend dev server
* `npm run backend` – FastAPI (reload) via Uvicorn
* `npm run dev:full` – Concurrent backend + frontend
* `npm run build` – Type check + production bundle
* `npm run build:api` – Build with `API_BACKEND` injected
* `npm run lint` / `format` / `format:check`
* `npm run backend:up` / `backend:down` – Compose helpers
* `npm run deploy` – Deploy static site to GitHub Pages

Recommended: Node 20.x, Python 3.11.

## 8. Environment Variables

| Variable              | Scope          | Required (Prod) | Default    | Description                                 |
| --------------------- | -------------- | --------------- | ---------- | ------------------------------------------- |
| `API_BACKEND`         | Frontend build | Yes             | (none)     | Absolute backend API base baked into bundle |
| `ALLOWED_ORIGINS`     | Backend        | No              | `*`        | Comma list for CORS                         |
| `PORT`                | Backend        | No              | `8000`     | Uvicorn port                                |
| `OPENAI_API_KEY`      | Backend        | If AI features  | (none)     | For IPA estimation (fallback)               |
| `WIKTIONARY_DATA_URL` | Backend        | No              | Kaikki URL | Dataset source                              |
| `SKIP_DOWNLOAD`       | Backend        | No              | `0`        | Set `1` to skip auto download               |

## 9. Docker Usage

Image: `ghcr.io/vialab/wiktionaryviz-backend:latest`

Features:

* Non-root runtime
* Layer-cached dependency install
* Streaming download + unzip on first run
* Reusable volume to avoid re-download

Compose volume example:

```yaml
volumes:
  wiktionary-data:
services:
  backend:
    image: ghcr.io/vialab/wiktionaryviz-backend:latest
    volumes:
      - wiktionary-data:/app/data
```

## 10. API Reference

Base (dev): `http://localhost:8000` – Interactive docs at `/docs`.

| Method   | Path                         | Status      | Notes                                                                 |
| -------- | ---------------------------- | ----------- | --------------------------------------------------------------------- |
| GET      | `/`                          | stable      | Health message                                                        |
| GET      | `/word-data`                 | implemented | Returns single lexical entry (raw JSON)                               |
| GET      | `/available-languages`       | implemented | Lists languages containing a given surface form                       |
| GET      | `/random-interesting-word`   | implemented | Random entry from stats category                                      |
| GET      | `/ancestry-chain`            | partial     | Builds chain; IPA estimation fallback; drift scores computed per link |
| GET      | `/phonetic-drift-detailed`   | partial     | Returns alignment + feature changes (no compact score yet)            |
| GET      | `/descendant-tree`           | partial     | Builds tree from given word; traversal heuristics evolving            |
| GET      | `/descendant-tree-from-root` | partial     | Treats provided word/lang as root                                     |
| (future) | `/phonetic-drift`            | planned     | Compact numeric distance only                                         |
| (future) | `/compare`                   | planned     | Word vs word ancestry + drift                                         |
| (future) | `/ai/*`                      | planned     | Exploration suggestions                                               |
| (future) | `/kwic`                      | planned     | KWIC concordance lines                                                |

Error handling: 404 for missing indexed key, 500 for unexpected exceptions.

## 11. Frontend Build & Deployment

GitHub Pages deploy (via workflow): builds with `API_BACKEND` secret → publishes `dist/` to `gh-pages` (base path set in `vite.config.ts`).

Local production build:

```bash
API_BACKEND=https://your-backend.example.org npm run build
```

Serve the `dist/` output (any static host).

## 12. CI / Release Automation

Workflows:

* `release-please.yml` – Conventional commits → automated versioning & CHANGELOG
* `frontend-deploy.yml` – Static site build + Pages publish
* `backend-docker.yml` – Multi-arch Docker build & GHCR push

Release model: 0.x (minor may break). Conventional commit scopes recommended for clarity.

## 13. Troubleshooting

| Symptom               | Cause                                    | Resolution                                                             |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| 404 for valid word    | Index missing or not loaded              | Ensure index + stats built (`python build_index.py`) & restart backend |
| Slow first start      | Large dataset download/unpack            | Persist data volume / pre-seed dump                                    |
| CORS errors           | Origin mismatch                          | Set `ALLOWED_ORIGINS` or deploy behind proxy                           |
| Empty visualizations  | Endpoint stubs / partial implementations | Guard frontend fetches / contribute implementations                    |
| Memory pressure       | Large mmap JSONL                         | Increase container memory / split dataset                              |
| Mixed content blocked | HTTPS site → HTTP API                    | Serve API over HTTPS or use proxy                                      |

## 14. Contributing

1. Create a focused feature/bug branch (`feat/…`, `fix/…`).
2. Use Conventional Commits (e.g., `feat(descendants): add depth limiting`). You can use [`oco`](https://github.com/di-sukharev/opencommit) to help generate commit messages that follow this standard.
3. Run lint + format before pushing: `npm run lint && npm run format:check`.
4. Document new or changed endpoints in the README API table.
5. Avoid committing large data dumps (use download flow / volumes).
6. Do not manually edit `CHANGELOG.md` (managed by release-please).

Suggested commit scopes: `frontend`, `backend`, `descendants`, `phonology`, `timeline`, `geospatial`, `build`, `ci`, `docs`.

## 15. License & Attribution

* MIT License (see `LICENSE`).
* Data derived from Wiktionary via Wiktextract / Kaikki.org (CC-BY-SA 3.0 & GFDL terms apply to original content).
* Phonological feature data: PanPhon.

Please cite Wiktionary, Wiktextract, and PanPhon in academic outputs.

## 16. Security / Responsible Use

* Do not rely on AI-estimated IPA for authoritative linguistic claims.
* Validate external input before exposing new endpoints publicly.
* Respect Wiktionary licensing when redistributing derived datasets.
