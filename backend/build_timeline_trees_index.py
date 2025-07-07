import os
import json
from tqdm import tqdm

TIMELINE_TREES_FILE = os.path.join(os.path.dirname(__file__), "data/timeline_trees.jsonl")
TIMELINE_TREES_INDEX_FILE = os.path.join(os.path.dirname(__file__), "data/timeline_trees_index.json")

# Count total lines for progress bar
with open(TIMELINE_TREES_FILE, "r", encoding="utf-8") as f:
    total_lines = sum(1 for _ in f)

# Build an index mapping key -> byte offset for timeline_trees.jsonl
index = {}
with open(TIMELINE_TREES_FILE, "r", encoding="utf-8") as f, tqdm(total=total_lines, desc="Indexing timeline_trees", unit=" lines") as pbar:
    while True:
        offset = f.tell()
        line = f.readline()
        if not line:
            break
        try:
            obj = json.loads(line)
            key = f"{obj['word'].lower()}_{obj['lang_code'].lower()}"
            index[key] = offset
        except Exception:
            continue
        pbar.update(1)

with open(TIMELINE_TREES_INDEX_FILE, "w", encoding="utf-8") as out:
    json.dump(index, out, ensure_ascii=False, indent=2)

print(f"✅ Built timeline_trees_index.json for {len(index)} entries.")
