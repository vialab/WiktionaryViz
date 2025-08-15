from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import sys
import subprocess
import os
import signal

from api_routes import phonology, word_data, descendants
# TODO [HIGH LEVEL]: Add routers for AI suggestions, KWIC examples, user-corpus uploads, and GeoJSON utilities.
# TODO [LOW LEVEL]: Implement modules `api_routes/ai_tools.py`, `api_routes/kwic.py`, `api_routes/user_corpus.py`, `api_routes/geojson.py` and include them.
from constants import load_index

# Helper: check and (re)build main index and stats if needed or requested
def ensure_main_index(rebuild=False):
    """Check and (re)build main index and stats if needed or requested."""
    from constants import DATA_DIR
    index_path = os.path.join(DATA_DIR, "wiktionary_index.json")
    longest_words_path = os.path.join(DATA_DIR, "longest_words.json")
    most_translations_path = os.path.join(DATA_DIR, "most_translations.json")
    most_descendants_path = os.path.join(DATA_DIR, "most_descendants.json")
    required_files = [index_path, longest_words_path, most_translations_path, most_descendants_path]
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if rebuild or not all(os.path.exists(f) for f in required_files):
        print("[INFO] Building main index and stats files...")
        subprocess.run([
            sys.executable, os.path.join(backend_dir, "build_index.py")
        ], check=True, cwd=backend_dir)
    else:
        print("[INFO] Main index and stats files already exist. Skipping rebuild.")

def get_rebuild_flag() -> bool:
    """Return True if index rebuild is requested via CLI args."""
    return any(arg in ("--rebuild-index", "--rebuild-all") for arg in sys.argv)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler: setup and teardown logic."""
    rebuild_index = get_rebuild_flag()
    ensure_main_index(rebuild_index)
    load_index()
    yield
    print("[INFO] FastAPI backend is shutting down. Cleanup complete.")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(phonology.router)
app.include_router(word_data.router)
app.include_router(descendants.router)
# TODO [LOW LEVEL]: app.include_router(ai_tools.router); app.include_router(kwic.router); app.include_router(user_corpus.router); app.include_router(geojson.router)

@app.get("/")
async def root() -> dict:
    """Root endpoint for health check."""
    return {"message": "FastAPI JSONL Backend is running"}

def rebuild_all() -> None:
    """Rebuild all index and stats files."""
    ensure_main_index(True)
    print("[INFO] Rebuild complete.")

if __name__ == "__main__":
    if "--rebuild-all" in sys.argv:
        rebuild_all()
    elif "--rebuild-index" in sys.argv:
        ensure_main_index(True)
        print("[INFO] Main index rebuild complete.")
    else:
        import uvicorn
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
