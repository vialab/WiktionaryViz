from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import mmap

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JSONL_FILE_PATH = "wiktionary_data.jsonl"
INDEX_FILE_PATH = "wiktionary_index.json"

# Load index into memory on startup
index = {}

@app.on_event("startup")
async def load_index():
    """Load index mapping words to byte offsets."""
    global index
    try:
        with open(INDEX_FILE_PATH, "r", encoding="utf-8") as f:
            index = json.load(f)
        print(f"✅ Loaded index with {len(index)} words.")
    except FileNotFoundError:
        print("❌ Index file not found. Run `build_index.py` first.")


@app.get("/")
async def root():
    return {"message": "FastAPI JSONL Backend is running"}


@app.get("/word-data")
async def get_word_data(
    word: str = Query(..., description="The word to search for"),
    lang_code: str = Query(..., description="The language code (e.g. en, fr)")
):
    key = f"{word.lower()}_{lang_code.lower()}"

    if key not in index:
        return JSONResponse(content={"message": "No matching entries found."}, status_code=404)

    matches = []

    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mmapped_file = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)  # Memory-map the file

            for offset in index[key]:  # Seek directly to the stored byte positions
                mmapped_file.seek(offset)
                line = mmapped_file.readline().decode("utf-8").strip()

                try:
                    entry = json.loads(line)
                    matches.append(entry)
                except json.JSONDecodeError:
                    continue

            mmapped_file.close()

        return JSONResponse(content={"matches": matches})

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
