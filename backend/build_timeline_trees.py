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
    offset = index.get(key)
    if offset is None:
        return None
    with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        mm.seek(offset)
        line = mm.readline().decode("utf-8").strip()
        mm.close()
        if not line:
            # Optionally log: print(f"[WARN] Empty line for key {key} at offset {offset}")
            return None
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

def make_id(word, lang_code):
    word = word.lower() if word else "unknown"
    lang_code = lang_code.lower() if lang_code else "unknown"
    return f"{word}_{lang_code}_id"

def extract_pronunciation(data):
    if data and data.get("sounds"):
        for s in data["sounds"]:
            if s.get("ipa"):
                return s["ipa"]
    return data.get("ai_estimated_ipa") or "estimated"

def extract_etymology_chain(word, lang_code, etymology_text, etymology_templates):
    chain = []
    # Start with the current word
    chain.append({
        "word": word,
        "lang_code": lang_code,
        "etymology": etymology_text,
        "template": None
    })
    # Walk through etymology_templates
    for tpl in etymology_templates:
        rel = "borrowed_from" if tpl["name"] == "bor" else "derived_from"
        lang = tpl["args"].get("2")
        w = tpl["args"].get("3") or "unknown"
        chain.append({
            "word": w,
            "lang_code": lang,
            "etymology": tpl.get("expansion", ""),
            "template": tpl,
            "relation": rel
        })
    return chain

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
        for key in tqdm(index.keys(), desc="Building timeline linked nodes"):
            word, lang_code = key.rsplit("_", 1)
            data = get_word_data(key)
            if not data:
                continue
            etymology_text = data.get("etymology_text", "")
            etymology_templates = data.get("etymology_templates", [])
            chain = extract_etymology_chain(word, lang_code, etymology_text, etymology_templates)
            # Build nodes with links
            for i, node in enumerate(chain):
                node_id = make_id(node["word"], node["lang_code"])
                linked_nodes = []
                if i+1 < len(chain):
                    prev = chain[i+1]
                    linked_nodes.append({
                        "id": make_id(prev["word"], prev["lang_code"]),
                        "relation": prev.get("relation", "derived_from"),
                        "language": prev["lang_code"],
                        "word": prev["word"]
                    })
                # Try to get pronunciation from data if available
                pron = None
                word_part = node['word'].lower() if node['word'] else "unknown"
                lang_part = node['lang_code'].lower() if node['lang_code'] else "unknown"
                k = f"{word_part}_{lang_part}"
                d = get_word_data(k)
                pron = extract_pronunciation(d) if d else "estimated"
                # Convert etymology_templates into linked_nodes if present
                if etymology_templates:
                    linked_nodes = []
                    for tpl in etymology_templates:
                        child_word = tpl['args'].get('3')
                        child_lang = tpl['args'].get('2')
                        if child_word and child_lang:
                            linked_nodes.append({
                                "id": make_id(child_word, child_lang),
                                "relation": tpl.get("name", "derived_from"),
                                "language": child_lang,
                                "word": child_word
                            })
                # Always write a node, even if we have no data for it (stub if missing)
                out.write(json.dumps({
                    "id": node_id,
                    "word": node["word"],
                    "lang_code": node["lang_code"],
                    "data": {
                        "etymology": node["etymology"],
                        "linked_nodes": linked_nodes,
                        "etymology_templates": data.get("etymology_templates", [])
                    },
                    "pronunciation": pron if d else None
                }, ensure_ascii=False) + "\n")
    print(f"✅ Wrote timeline linked nodes to {TIMELINE_TREES_FILE}")
    os.system(f"python {os.path.join(os.path.dirname(__file__), 'build_timeline_trees_index.py')}")
