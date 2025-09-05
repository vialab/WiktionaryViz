import os
import json
from panphon.featuretable import FeatureTable
from panphon.distance import Distance

# === Base paths ===
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# === File paths ===
INDEX_FILE_PATH = os.path.join(DATA_DIR, "wiktionary_index.json")
JSONL_FILE_PATH = os.path.join(DATA_DIR, "wiktionary_data.jsonl")
LANG_MAP_FILE_PATH = os.path.join(DATA_DIR, "language_codes.json")

# === PanPhon tools ===
ft = FeatureTable()
dst = Distance()

# === Cost constants ===
MAX_FEATURE_DIFFS = len(ft.names)
INSERTION_COST = MAX_FEATURE_DIFFS + 1
DELETION_COST = MAX_FEATURE_DIFFS + 1
UNKNOWN_COST = MAX_FEATURE_DIFFS

# === Global caches ===
index = {}
lang_code_to_name = {}

def load_index():
    """Load JSON word index from file."""
    global index
    try:
        with open(INDEX_FILE_PATH, "r", encoding="utf-8") as f:
            index.update(json.load(f))
        print(f"✅ Loaded index with {len(index)} entries.")
    except FileNotFoundError:
        print("❌ Index file not found at:", INDEX_FILE_PATH)

def load_language_code_map():
    """Load language code -> name map from existing JSON file.

    Building is handled by `build_language_codes.py`. This function only loads.
    """
    global lang_code_to_name
    try:
        with open(LANG_MAP_FILE_PATH, 'r', encoding='utf-8') as f:
            lang_code_to_name.update(json.load(f))
        print(f"✅ Loaded {len(lang_code_to_name)} language names.")
    except FileNotFoundError:
        print(f"⚠️ Language codes file not found at {LANG_MAP_FILE_PATH}. Run build_language_codes.py to generate it.")
    except Exception as e:
        print(f"⚠️ Failed to load language codes: {e}")
