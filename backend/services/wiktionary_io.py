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
    """
    Build a descendant hierarchy starting from `word`.

    New behavior: return a list of nodes for each matched index key that includes
    the `word` and `lang_code`, and children under `children` as a recursive list.

    This preserves language information for downstream consumers.
    """
    if visited is None:
        visited = set()
    key_prefix = f"{word.lower()}_"
    results = []

    def _get_offset(k):
        v = index.get(k)
        if isinstance(v, (list, tuple)) and len(v) > 0:
            return v[0]
        return v

    for key in index:
        if key.startswith(key_prefix) and (lang_code is None or key.endswith(f"_{lang_code.lower()}")):
            if key in visited:
                continue
            visited.add(key)
            offset = _get_offset(key)
            try:
                f.seek(offset)
                entry = json.loads(f.readline().decode("utf-8"))
            except Exception:
                continue

            # Base node info
            node = {
                "word": entry.get("word"),
                "lang_code": entry.get("lang_code"),
                "expansion": entry.get("expansion"),
                "children": [],
            }

            # Explore explicit descendant links (text field) and attach children with language info
            descendants = entry.get("descendants", [])
            for desc in descendants:
                text = desc.get("text", "")
                # Expect a pattern like 'lang: word' or similar; skip noisy values
                if ":" not in text or "unsorted" in text.lower():
                    continue
                _, child_word = text.split(":", 1)
                child_word = child_word.strip().split(" ")[0]
                if not child_word:
                    continue

                # Find all index keys matching the child word (any language). For each,
                # recurse and attach the detailed child node (retaining its lang_code).
                child_prefix = f"{child_word.lower()}_"
                for child_key in index:
                    if child_key.startswith(child_prefix):
                        if child_key in visited:
                            continue
                        # Recurse for the child_key's word (and prefer its specific lang)
                        child_offset = _get_offset(child_key)
                        try:
                            f.seek(child_offset)
                            child_entry = json.loads(f.readline().decode("utf-8"))
                        except Exception:
                            continue
                        # Avoid cycles by marking visited copy
                        visited_copy = visited.copy()
                        visited_copy.add(child_key)
                        child_node = {
                            "word": child_entry.get("word"),
                            "lang_code": child_entry.get("lang_code"),
                            "expansion": child_entry.get("expansion"),
                            "children": build_descendant_hierarchy(child_entry.get("word"), f, child_entry.get("lang_code"), depth + 1, visited_copy).get("children", []),
                        }
                        node["children"].append(child_node)

            results.append(node)

    # If this is a top-level call, wrap in a dict for compatibility, else return a structure
    return {"name": word, "children": results} if depth == 0 else {"name": word, "children": results}
