import os
import json
from panphon.featuretable import FeatureTable
from panphon.distance import Distance

# === Base paths ===
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# === File paths ===
INDEX_FILE_PATH = os.path.join(DATA_DIR, "wiktionary_index.json")
JSONL_FILE_PATH = os.path.join(DATA_DIR, "wiktionary_data.jsonl")

# === PanPhon tools ===
ft = FeatureTable()
dst = Distance()

# === Cost constants ===
MAX_FEATURE_DIFFS = len(ft.names)
INSERTION_COST = MAX_FEATURE_DIFFS + 1
DELETION_COST = MAX_FEATURE_DIFFS + 1
UNKNOWN_COST = MAX_FEATURE_DIFFS

# === Global index cache ===
index = {}

def load_index():
    """Load JSON word index from file."""
    global index
    try:
        with open(INDEX_FILE_PATH, "r", encoding="utf-8") as f:
            index.update(json.load(f))
        print(f"✅ Loaded index with {len(index)} entries.")
    except FileNotFoundError:
        print("❌ Index file not found at:", INDEX_FILE_PATH)
