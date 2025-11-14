import json
import logging
from constants import index

# Configure basic logging for debugging when running locally.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wiktionary_io")


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
                v = index.get(key)
                offset = v[0] if isinstance(v, (list, tuple)) and v else v
                mmapped_file.seek(offset)
                next_entry = json.loads(mmapped_file.readline().decode("utf-8"))
                if "etymology_text" in next_entry:
                    current = next_entry
                    found_next = True
                    break
        if not found_next:
            break
    return current.get("word")


def _normalize_for_match(s):
    if not s:
        return None
    return str(s).strip().lower()


def build_descendant_hierarchy(word, f, lang_code=None, depth=0, visited=None, max_depth=50):
    """
    Build a descendant hierarchy starting from `word` by finding entries whose
    `etymology_templates` refer to `word` (args['3'] or args['tr']).

    Returns a dict: {"name": word, "children": [ {"word":..., "lang_code":..., "expansion":..., "children": [...]}, ... ] }

    - `f` should be an open file-like object supporting `seek()` and `readline()` (mmap is preferred).
    - `visited` is a set of index keys already processed to avoid cycles.
    - `max_depth` prevents runaway recursion on noisy data.
    """
    if visited is None:
        visited = set()

    if depth >= max_depth:
        logger.info("max_depth reached for %s at depth %d", word, depth)
        return {"name": word, "children": []}

    target_norm = _normalize_for_match(word)
    results = []

    logger.info("build_descendant_hierarchy target=%r lang_code=%r depth=%d", word, lang_code, depth)

    def _get_offset(k):
        v = index.get(k)
        if isinstance(v, (list, tuple)) and len(v) > 0:
            return v[0]
        return v

    # Scan all index entries to find those that cite `word` as an ancestor in etymology_templates.
    for key, val in index.items():
        # if lang_code is provided, filter by key suffix
        if lang_code and not key.endswith(f"_{lang_code.lower()}"):
            continue
        if key in visited:
            continue

        offset = _get_offset(key)
        try:
            f.seek(offset)
            entry = json.loads(f.readline().decode("utf-8"))
        except Exception as exc:
            logger.debug("failed to read entry at offset %r for key %s: %s", offset, key, exc)
            continue

        # Look for etymology templates that reference this target
        templates = entry.get("etymology_templates", []) or []
        matched = False
        for tpl in templates:
            if not tpl or not isinstance(tpl, dict):
                continue
            args = tpl.get("args") or {}
            cand = args.get("3")
            tr = args.get("tr")
            if _normalize_for_match(cand) == target_norm or _normalize_for_match(tr) == target_norm:
                matched = True
                break

        if not matched:
            continue

        logger.info("matched descendant: key=%s offset=%s word=%r lang=%r", key, offset, entry.get("word"), entry.get("lang_code"))

        # We have an entry that derives from `word`.
        visited.add(key)

        child_word = entry.get("word")
        child_lang = entry.get("lang_code")
        child_exp = entry.get("expansion")

        # Recurse to build children of this child
        child_tree = build_descendant_hierarchy(child_word, f, lang_code=child_lang, depth=depth + 1, visited=visited, max_depth=max_depth)

        logger.debug("built child tree for %r lang=%r -> %d children", child_word, child_lang, len(child_tree.get("children", [])))

        node = {
            "word": child_word,
            "lang_code": child_lang,
            "expansion": child_exp,
            "children": child_tree.get("children", []),
        }
        results.append(node)

    logger.info("finished %r: found %d children at depth %d", word, len(results), depth)
    return {"name": word, "children": results}
