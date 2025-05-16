import json
from constants import index

def find_root_ancestor(entry, mmapped_file):
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
    return {"name": word, "children": results}
