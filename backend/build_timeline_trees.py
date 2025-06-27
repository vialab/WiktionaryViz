import os
import json
import mmap
from tqdm import tqdm
from collections import defaultdict
from constants import INDEX_FILE_PATH, JSONL_FILE_PATH, ft
from services.aligner import align_segments

# Output file for precomputed timeline trees
TIMELINE_TREES_FILE = os.path.join(os.path.dirname(__file__), "data/timeline_trees.jsonl")

# Load index
with open(INDEX_FILE_PATH, "r", encoding="utf-8") as f:
    index = json.load(f)

# Helper: get word data from JSONL using byte offset
def get_word_data(key):
    offsets = index.get(key)
    if not offsets:
        return None
    with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        mm.seek(offsets[0])
        line = mm.readline().decode("utf-8").strip()
        mm.close()
        return json.loads(line)

# Helper: get IPA from word data
def get_ipa(data):
    if not data:
        return None
    if data.get("sounds"):
        for s in data["sounds"]:
            if s.get("ipa"):
                return s["ipa"]
    return data.get("ai_estimated_ipa")

# Compute phonetic drift (inline, not via HTTP)
def compute_phonetic_drift(ipa1, ipa2):
    if not ipa1 or not ipa2:
        return None
    segs1 = ft.ipa_segs(ipa1)
    segs2 = ft.ipa_segs(ipa2)
    alignment = align_segments(segs1, segs2, ft)
    diffs = []
    for s1, s2 in alignment:
        diffs.append({"from": s1, "to": s2})
    return {"ipa1": ipa1, "ipa2": ipa2, "alignment": diffs}

# Recursively build the etymology tree with phonetic drift

def build_etymology_tree(word, lang_code, depth=0, max_depth=10, seen=None):
    if depth > max_depth:
        return None
    if seen is None:
        seen = set()
    key = f"{word.lower()}_{lang_code.lower()}"
    if key in seen:
        return None
    seen.add(key)
    node = get_word_data(key)
    if not node:
        return None
    children = []
    for tpl in node.get("etymology_templates", []):
        child_word = tpl["args"].get("3")
        child_lang = tpl["args"].get("2")
        if child_word and child_lang:
            child_node = build_etymology_tree(child_word, child_lang, depth+1, max_depth, seen.copy())
            ipa1 = get_ipa(node)
            ipa2 = get_ipa(child_node) if child_node else None
            drift = compute_phonetic_drift(ipa1, ipa2) if ipa1 and ipa2 else None
            children.append({
                "word": child_word,
                "lang_code": child_lang,
                "data": child_node,
                "phonetic_drift": drift
            })
    node["etymology_children"] = children
    return node

# After writing timeline_trees.jsonl, build the index for fast retrieval
if __name__ == "__main__":
    with open(TIMELINE_TREES_FILE, "w", encoding="utf-8") as out:
        for key in tqdm(index.keys(), desc="Building timeline trees"):
            word, lang_code = key.rsplit("_", 1)
            tree = build_etymology_tree(word, lang_code)
            if tree:
                out.write(json.dumps({"word": word, "lang_code": lang_code, "tree": tree}, ensure_ascii=False) + "\n")
    print(f"✅ Wrote timeline trees to {TIMELINE_TREES_FILE}")
    # Build the index file for fast lookup
    os.system(f"python {os.path.join(os.path.dirname(__file__), 'build_timeline_trees_index.py')}")
