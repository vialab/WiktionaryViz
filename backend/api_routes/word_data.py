import os, json, random, mmap
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import DATA_DIR, index, JSONL_FILE_PATH

router = APIRouter()

@router.get("/word-data")
async def get_word_data(word: str = Query(...), lang_code: str = Query(...)):
    key = f"{word.lower()}_{lang_code.lower()}"
    if key not in index:
        return JSONResponse(content={"message": "No matching entries found."}, status_code=404)

    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(index[key][0])
            line = mm.readline().decode("utf-8").strip()
            mm.close()
            return JSONResponse(content=json.loads(line))
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@router.get("/available-languages")
async def get_available_languages(word: str = Query(...)):
    word = word.lower()
    langs = [key.split("_", 1)[1] for key in index if key.startswith(f"{word}_")]
    if not langs:
        return JSONResponse(content={"message": "No languages found."}, status_code=404)
    return JSONResponse(content={"languages": sorted(set(langs))})

@router.get("/random-interesting-word")
async def get_random_interest():
    categories = {
        "longest_words": os.path.join(DATA_DIR, "longest_words.json"),
        "most_translations": os.path.join(DATA_DIR, "most_translations.json"),
        "most_descendants": os.path.join(DATA_DIR, "most_descendants.json"),
    }
    cat = random.choice(list(categories.keys()))
    file_path = categories[cat]

    if not os.path.exists(file_path):
        return JSONResponse(content={"error": f"No file for category '{cat}'."}, status_code=500)

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not data:
        return JSONResponse(content={"error": f"No entries found in {file_path}."}, status_code=404)

    return {"category": cat, "entry": random.choice(data)}
