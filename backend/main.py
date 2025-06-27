from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import sys
import subprocess
import os

from api_routes import phonology, word_data, descendants, word_etymology_tree_precomputed
from constants import load_index

# Helper: check and (re)build timeline trees and index if needed or requested
def ensure_timeline_trees(rebuild=False):
    from constants import DATA_DIR
    trees_path = os.path.join(DATA_DIR, "timeline_trees.jsonl")
    index_path = os.path.join(DATA_DIR, "timeline_trees_index.json")
    if rebuild or not (os.path.exists(trees_path) and os.path.exists(index_path)):
        print("[INFO] Building timeline trees and index...")
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "build_timeline_trees.py")], check=True)
    else:
        print("[INFO] Timeline trees and index already exist. Skipping rebuild.")

# Helper: check and (re)build main index and stats if needed or requested
def ensure_main_index(rebuild=False):
    from constants import DATA_DIR
    index_path = os.path.join(DATA_DIR, "wiktionary_index.json")
    longest_words_path = os.path.join(DATA_DIR, "longest_words.json")
    most_translations_path = os.path.join(DATA_DIR, "most_translations.json")
    most_descendants_path = os.path.join(DATA_DIR, "most_descendants.json")
    required_files = [index_path, longest_words_path, most_translations_path, most_descendants_path]
    if rebuild or not all(os.path.exists(f) for f in required_files):
        print("[INFO] Building main index and stats files...")
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "build_index.py")], check=True)
    else:
        print("[INFO] Main index and stats files already exist. Skipping rebuild.")

def get_rebuild_flags():
    # Only --rebuild-all triggers both. --rebuild-timeline-trees triggers only trees, --rebuild-index only index
    rebuild_index = any(arg in ("--rebuild-index", "--rebuild-all") for arg in sys.argv)
    # Only rebuild trees if --rebuild-timeline-trees or --rebuild-all is present
    rebuild_trees = any(arg in ("--rebuild-timeline-trees", "--rebuild-all") for arg in sys.argv)
    return rebuild_index, rebuild_trees

@asynccontextmanager
async def lifespan(app: FastAPI):
    rebuild_index, rebuild_trees = get_rebuild_flags()
    ensure_main_index(rebuild_index)
    ensure_timeline_trees(rebuild_trees)
    load_index()
    yield
    # (Optional) Add any shutdown/cleanup logic here

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(phonology.router)
app.include_router(word_data.router)
app.include_router(descendants.router)
app.include_router(word_etymology_tree_precomputed.router)

@app.get("/")
async def root():
    return {"message": "FastAPI JSONL Backend is running"}

def rebuild_all():
    ensure_main_index(True)
    ensure_timeline_trees(True)
    print("[INFO] Rebuild complete.")

if __name__ == "__main__":
    if "--rebuild-all" in sys.argv:
        rebuild_all()
    elif "--rebuild-index" in sys.argv:
        ensure_main_index(True)
        print("[INFO] Main index rebuild complete.")
    elif "--rebuild-timeline-trees" in sys.argv:
        ensure_timeline_trees(True)
        print("[INFO] Timeline trees rebuild complete.")
    else:
        import uvicorn
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
