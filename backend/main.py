import os
import random
import json
import mmap
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from panphon.distance import Distance
from panphon.featuretable import FeatureTable

# === File paths ===
JSONL_FILE_PATH = "wiktionary_data.jsonl"
INDEX_FILE_PATH = "wiktionary_index.json"
DESCENDANT_HOF_PATH = "most_descendants.json"

# === Globals ===
index = {}
ft = FeatureTable()
dst = Distance()

# === FastAPI Setup ===
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    word: str = Query(...),
    lang_code: str = Query(...)
):
    """
    Returns a single Wiktionary entry based on word and language code.
    """
    key = f"{word.lower()}_{lang_code.lower()}"

    if key not in index:
        return JSONResponse(content={"message": "No matching entries found."}, status_code=404)

    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mmapped_file = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            offset = index[key][0]
            mmapped_file.seek(offset)
            line = mmapped_file.readline().decode("utf-8").strip()
            mmapped_file.close()
            return JSONResponse(content=json.loads(line))
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/phonetic-drift")
async def phonetic_drift(
    ipa1: str = Query(..., description="First IPA string"),
    ipa2: str = Query(..., description="Second IPA string")
):
    """
    Returns normalized weighted feature edit distance between two IPA strings.
    """
    try:
        segments1 = ft.ipa_segs(ipa1)
        segments2 = ft.ipa_segs(ipa2)

        raw_distance = dst.weighted_feature_edit_distance(ipa1, ipa2)
        avg_len = (len(segments1) + len(segments2)) / 2
        normalized = raw_distance / avg_len if avg_len > 0 else 0

        return {
            "ipa1": ipa1,
            "ipa2": ipa2,
            "segments1": segments1,
            "segments2": segments2,
            "raw_distance": round(raw_distance, 3),
            "normalized_distance": round(normalized, 3)
        }

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/available-languages")
async def get_available_languages(
    word: str = Query(..., description="The word to list available language codes for")
):
    """
    Returns all language codes in the dataset for a given word.
    """
    word = word.lower()
    matching_langs = [key.split("_", 1)[1] for key in index if key.startswith(f"{word}_")]

    if not matching_langs:
        return JSONResponse(content={"message": "No languages found for this word."}, status_code=404)

    return JSONResponse(content={"languages": sorted(set(matching_langs))})

@app.get("/random-interesting-word")
async def get_random_interesting_word():
    """
    Returns a random entry from one of the interesting categories.
    """
    categories = {
        "longest_words": "longest_words.json",
        "most_translations": "most_translations.json",
        "most_descendants": "most_descendants.json",
    }

    chosen_category = random.choice(list(categories.keys()))
    file_path = categories[chosen_category]

    if not os.path.exists(file_path):
        return JSONResponse(content={"error": f"Data file not found for category '{chosen_category}'."}, status_code=500)

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not data:
            return JSONResponse(content={"error": f"No entries found in {file_path}."}, status_code=404)

        chosen_entry = random.choice(data)
        return {
            "category": chosen_category,
            "entry": chosen_entry
        }

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/descendant-tree")
async def get_descendant_tree(
    word: str = Query(...),
    lang_code: str = Query(...)
):
    """
    Returns a radial tree starting from the furthest ancestor of a given word.
    """
    key = f"{word.lower()}_{lang_code.lower()}"
    if key not in index:
        return JSONResponse(content={"error": "Word not found."}, status_code=404)

    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mmapped_file = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            offset = index[key][0]
            mmapped_file.seek(offset)
            entry = json.loads(mmapped_file.readline().decode("utf-8"))

            root_word = find_root_ancestor(entry, mmapped_file)
            descendant_tree = build_descendant_hierarchy(root_word, mmapped_file)

            mmapped_file.close()
            return JSONResponse(content=descendant_tree)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/descendant-tree-from-root")
async def descendant_tree_from_root(
    word: str = Query(...),
    lang_code: str = Query(...)
):
    """
    Returns a descendant tree starting from a known root word (no upward search).
    Useful for PIE root exploration like *ḱorkeh₂.
    """
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mmapped_file = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            descendant_tree = build_descendant_hierarchy(word, mmapped_file, lang_code=lang_code)
            mmapped_file.close()
            return JSONResponse(content=descendant_tree)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# === Recursive helpers ===

def find_root_ancestor(entry, mmapped_file):
    """
    Recursively find the top-most ancestor by traversing etymology chain.
    """
    visited = set()
    current = entry

    while True:
        head_templates = current.get("head_templates", [])
        head = None
        for ht in head_templates:
            if ht.get("name") == "head":
                head = ht["args"].get("head") or current.get("word")
                break

        if not head or head in visited:
            break

        visited.add(head)
        found_next = False

        for key in index:
            if key.startswith(f"{head.lower()}_"):
                offset = index[key][0]
                mmapped_file.seek(offset)
                next_entry = json.loads(mmapped_file.readline().decode("utf-8"))
                if "etymology_text" in next_entry:
                    current = next_entry
                    found_next = True
                    break

        if not found_next:
            break

    return current.get("word")

def build_descendant_hierarchy(word, f, lang_code=None, depth=0, visited=None):
    """
    Recursively builds a hierarchical descendant tree for a given root word.
    Prevents cycles using a visited set.
    """
    if visited is None:
        visited = set()
    key_prefix = f"{word.lower()}_"

    results = []
    for key in index:
        if key.startswith(key_prefix) and (lang_code is None or key.endswith(f"_{lang_code.lower()}")):
            if key in visited:
                continue
            visited.add(key)

            offset = index[key][0]
            f.seek(offset)
            try:
                entry = json.loads(f.readline().decode("utf-8"))
            except Exception:
                continue

            descendants = entry.get("descendants", [])
            for desc in descendants:
                text = desc.get("text", "")
                if ":" not in text or "unsorted" in text.lower():
                    continue
                _, child_word = text.split(":", 1)
                child_word = child_word.strip().split(" ")[0]
                if child_word:
                    child_tree = build_descendant_hierarchy(child_word, f, None, depth + 1, visited.copy())
                    if child_tree:
                        results.append(child_tree)

    return {
        "name": word,
        "children": results
    }

