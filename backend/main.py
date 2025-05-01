from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from panphon.distance import Distance
from panphon.featuretable import FeatureTable
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

    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mmapped_file = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)  # Memory-map the file

            # Just return the first matching entry
            offset = index[key][0]
            mmapped_file.seek(offset)
            line = mmapped_file.readline().decode("utf-8").strip()

            mmapped_file.close()

            try:
                entry = json.loads(line)
                return JSONResponse(content=entry)
            except json.JSONDecodeError:
                return JSONResponse(content={"error": "Corrupted JSON entry."}, status_code=500)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# Load the panphon feature table and distance calculator

ft = FeatureTable()
dst = Distance()

@app.get("/phonetic-drift")
# example: /phonetic-drift?ipa1=tʰiː&ipa2=ˈt̪e
async def phonetic_drift(
    ipa1: str = Query(..., description="First IPA string"),
    ipa2: str = Query(..., description="Second IPA string")
):
    try:
        segments1 = ft.ipa_segs(ipa1)
        segments2 = ft.ipa_segs(ipa2)

        # Compute weighted distance
        raw_distance = dst.weighted_feature_edit_distance(ipa1, ipa2)
        avg_len = (len(segments1) + len(segments2)) / 2
        normalized = raw_distance / avg_len if avg_len > 0 else 0

        return JSONResponse(content={
            "ipa1": ipa1,
            "ipa2": ipa2,
            "segments1": segments1,
            "segments2": segments2,
            "raw_distance": round(raw_distance, 3),
            "normalized_distance": round(normalized, 3)
        })

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    
@app.get("/available-languages")
async def get_available_languages(
    word: str = Query(..., description="The word to list available language codes for")
):
    word = word.lower()
    matching_langs = []

    for key in index:
        if key.startswith(f"{word}_"):
            lang_code = key.split("_", 1)[1]
            matching_langs.append(lang_code)

    if not matching_langs:
        return JSONResponse(content={"message": "No languages found for this word."}, status_code=404)

    return JSONResponse(content={"languages": sorted(set(matching_langs))})
