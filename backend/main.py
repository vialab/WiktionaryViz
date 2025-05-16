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

ft = FeatureTable()

MAX_FEATURE_DIFFS = len(ft.names)
INSERTION_COST = MAX_FEATURE_DIFFS + 1
DELETION_COST = MAX_FEATURE_DIFFS + 1
UNKNOWN_COST = MAX_FEATURE_DIFFS

def phonological_cost(a: str, b: str, ft: FeatureTable) -> int:
    if a == b:
        return 0
    if a is None or b is None:
        return INSERTION_COST if a is None else DELETION_COST
    f1 = ft.fts(a)
    f2 = ft.fts(b)
    if not f1 or not f2:
        return UNKNOWN_COST
    return len(f1.differing_specs(f2))

def align_segments(seg1: list[str], seg2: list[str], ft: FeatureTable) -> list[tuple[str, str]]:
    m, n = len(seg1), len(seg2)
    dp = [[float('inf')] * (n + 1) for _ in range(m + 1)]
    back = [[None] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = 0

    for i in range(m + 1):
        for j in range(n + 1):
            if i < m and j < n:
                sub_cost = phonological_cost(seg1[i], seg2[j], ft)
                if dp[i + 1][j + 1] > dp[i][j] + sub_cost:
                    dp[i + 1][j + 1] = dp[i][j] + sub_cost
                    back[i + 1][j + 1] = (i, j)
            if i < m:
                del_cost = DELETION_COST
                if dp[i + 1][j] > dp[i][j] + del_cost:
                    dp[i + 1][j] = dp[i][j] + del_cost
                    back[i + 1][j] = (i, j)
            if j < n:
                ins_cost = INSERTION_COST
                if dp[i][j + 1] > dp[i][j] + ins_cost:
                    dp[i][j + 1] = dp[i][j] + ins_cost
                    back[i][j + 1] = (i, j)

    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        prev = back[i][j]
        if prev is None:
            break
        pi, pj = prev
        a = seg1[pi] if i - pi == 1 else None
        b = seg2[pj] if j - pj == 1 else None
        aligned.append((a, b))
        i, j = pi, pj

    return aligned[::-1]

@app.get("/phonetic-drift-detailed")
async def phonetic_drift_detailed(
    ipa1: str = Query(..., description="First IPA string"),
    ipa2: str = Query(..., description="Second IPA string")
):
    """
    Returns segment-by-segment aligned differences and direction of phonological feature changes.
    """
    try:
        segs1 = ft.ipa_segs(ipa1)
        segs2 = ft.ipa_segs(ipa2)
        alignment = align_segments(segs1, segs2, ft)

        def symbol(v):
            return {1: '+', 0: '0', -1: '-'}.get(v, '?')

        diffs = []
        for s1, s2 in alignment:
            if s1 and s2:
                f1 = ft.fts(s1)
                f2 = ft.fts(s2)
                if not f1 or not f2:
                    diff = {"from": s1, "to": s2, "status": "unknown"}
                else:
                    changing = f1.differing_specs(f2)
                    changes = {feat: f"{symbol(f1[feat])} → {symbol(f2[feat])}" for feat in changing}
                    diff = {"from": s1, "to": s2, "changes": changes}
            elif s1 and not s2:
                diff = {"from": s1, "to": None, "status": "deletion"}
            elif s2 and not s1:
                diff = {"from": None, "to": s2, "status": "insertion"}
            else:
                continue
            diffs.append(diff)

        return {
            "ipa1": ipa1,
            "ipa2": ipa2,
            "alignment": diffs
        }

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
