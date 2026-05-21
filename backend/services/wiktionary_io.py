import json
import logging
import unicodedata
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
        for head_key in _index_word_variants(head):
            for key in index:
                if key.startswith(f"{head_key}_"):
                    v = index.get(key)
                    offset = v[0] if isinstance(v, (list, tuple)) and v else v
                    mmapped_file.seek(offset)
                    next_entry = json.loads(mmapped_file.readline().decode("utf-8"))
                    if "etymology_text" in next_entry:
                        current = next_entry
                        found_next = True
                        break
            if found_next:
                break
        if not found_next:
            break
    return current.get("word")


def _normalize_for_match(s):
    if not s:
        return None
    return str(s).strip().lower()


def _index_word_variants(s):
    if not s:
        return []
    raw = str(s).strip().lower()
    variants = [raw]
    stripped = "".join(ch for ch in unicodedata.normalize("NFKD", raw) if unicodedata.category(ch) != "Mn")
    if stripped and stripped != raw:
        variants.append(stripped)
    return variants


def _candidate_index_keys(word, lang_code=None):
    word_variants = _index_word_variants(word)
    if not word_variants:
        return []

    candidates = []
    lang_key = _normalize_for_match(lang_code) if lang_code else None
    for normalized_word in word_variants:
        if lang_key:
            exact_key = f"{normalized_word}_{lang_key}"
            if exact_key in index and exact_key not in candidates:
                candidates.append(exact_key)
        for key in index:
            if key.startswith(f"{normalized_word}_") and key not in candidates:
                candidates.append(key)
    return candidates


def _extract_child_ref_from_descendant(desc):
    """
    Generically extract child reference from any Wiktionary descendant template.
    Tries multiple arg patterns across different template types (desc, der, cog, bnt-desc, etc.)
    Returns dict with word, lang_code, key, expansion or None.
    Language codes are typically shorter (2-10 chars) while words are longer.
    """
    if not isinstance(desc, dict):
        return None

    templates = desc.get("templates", []) or []
    
    # Try each template to extract a valid child reference
    for tpl in templates:
        if not isinstance(tpl, dict):
            continue
        
        name = (tpl.get("name") or "").strip().lower()
        args = tpl.get("args") or {}
        
        # Only process templates that look like descendant/derived/cognate templates
        if not any(keyword in name for keyword in ["desc", "der", "cog", "bnt", "mak"]):
            continue
        
        # Try to extract from positional args "1" and "2"
        # Language codes are typically short, so use length as primary heuristic
        arg1 = (args.get("1") or "").strip()
        arg2 = (args.get("2") or "").strip()
        arg1_norm = _normalize_for_match(arg1)
        arg2_norm = _normalize_for_match(arg2)
        
        if arg1_norm and arg2_norm:
            # If arg1 is much shorter, it's likely the language code
            # (e.g., "fr" vs "orenge", or "es" vs "naranja")
            if len(arg1_norm) <= 10 and (len(arg1_norm) < len(arg2_norm) or len(arg2_norm) > 15):
                return {
                    "word": arg2,
                    "lang_code": arg1_norm,
                    "key": f"{arg2.lower()}_{arg1_norm}",
                    "expansion": tpl.get("expansion") or desc.get("text"),
                }
            # Otherwise, arg2 is likely the language code
            elif len(arg2_norm) <= 10:
                return {
                    "word": arg1,
                    "lang_code": arg2_norm,
                    "key": f"{arg1.lower()}_{arg2_norm}",
                    "expansion": tpl.get("expansion") or desc.get("text"),
                }
        
        # Pattern 2: word in "1", lang_code in "lang" named arg
        arg1 = (args.get("1") or "").strip()
        lang_arg = _normalize_for_match(args.get("lang"))
        if arg1 and lang_arg:
            return {
                "word": arg1,
                "lang_code": lang_arg,
                "key": f"{arg1.lower()}_{lang_arg}",
                "expansion": tpl.get("expansion") or desc.get("text"),
            }
        
        # Pattern 3: word only in "1", no language code
        arg1 = (args.get("1") or "").strip()
        if arg1:
            return {
                "word": arg1,
                "lang_code": None,
                "key": None,
                "expansion": tpl.get("expansion") or desc.get("text"),
            }
    
    # Fallback: try text-based parsing for "lang: word" format
    text = desc.get("text", "")
    if isinstance(text, str) and ":" in text:
        lang_part, word_part = text.split(":", 1)
        child_word = word_part.strip().split(" ", 1)[0].strip()
        lang_code = _normalize_for_match(lang_part)
        if child_word and lang_code and len(lang_code) <= 10:
            return {
                "word": child_word,
                "lang_code": lang_code,
                "key": f"{child_word.lower()}_{lang_code}",
            }
    
    return None


def _child_refs_from_entry(entry, max_per_step=32):
    descendants = (entry or {}).get("descendants", []) or []
    child_refs = []
    seen = set()

    for desc in descendants:
        child_ref = _extract_child_ref_from_descendant(desc)
        if not child_ref:
            continue
        child_word = child_ref.get("word")
        lang_code = child_ref.get("lang_code")
        child_key = child_ref.get("key")
        if not child_word or not child_key:
            continue
        if child_key in seen:
            continue
        seen.add(child_key)
        child_refs.append({"word": child_word, "lang_code": lang_code, "key": child_key, "expansion": child_ref.get("expansion")})
        if len(child_refs) >= max_per_step:
            break

    return child_refs


def _read_entry_for_word(f, word, lang_code=None):
    for key in _candidate_index_keys(word, lang_code):
        try:
            offset = index.get(key)
            if isinstance(offset, (list, tuple)) and offset:
                offset = offset[0]
            f.seek(offset)
            entry = json.loads(f.readline().decode("utf-8"))
            return key, entry
        except Exception:
            continue
    return None, None


def build_descendant_hierarchy(
    word,
    f,
    lang_code=None,
    depth=0,
    visited=None,
    max_depth=50,
    node_budget=None,
):
    """
    Build a descendant hierarchy from a word by reading its explicit descendants list.

    Returns a dict: {"name": word, "children": [ {"word":..., "lang_code":..., "expansion":..., "children": [...]}, ... ] }

    - `f` should be an open file-like object supporting `seek()` and `readline()` (mmap is preferred).
    - `visited` is a set of index keys already processed to avoid cycles.
    - `max_depth` prevents runaway recursion on noisy data.
    - `node_budget` is a mutable dict like {"remaining": int, "truncated": bool} to bound work.
    """
    if visited is None:
        visited = set()

    if node_budget is None:
        node_budget = {"remaining": 2000, "truncated": False}

    if depth >= max_depth:
        logger.info("max_depth reached for %s at depth %d", word, depth)
        return {"name": word, "children": []}

    if node_budget.get("remaining", 0) <= 0:
        node_budget["truncated"] = True
        return {"name": word, "children": []}

    results = []

    logger.info("build_descendant_hierarchy target=%r lang_code=%r depth=%d", word, lang_code, depth)

    current_key, current_entry = _read_entry_for_word(f, word, lang_code)
    if not current_entry:
        logger.info("no descendant entry found for %r (%r)", word, lang_code)
        return {"name": word, "children": []}

    seen_children = set()
    for child_ref in _child_refs_from_entry(current_entry):
        child_word = child_ref.get("word")
        child_lang = child_ref.get("lang_code")
        if not child_word:
            continue

        child_key, child_entry = _read_entry_for_word(f, child_word, child_lang)
        if not child_entry:
            continue

        if child_key in visited or child_key in seen_children:
            continue

        seen_children.add(child_key)
        visited.add(child_key)
        node_budget["remaining"] = max(0, node_budget.get("remaining", 0) - 1)
        if node_budget.get("remaining", 0) <= 0:
            node_budget["truncated"] = True

        child_word = child_entry.get("word")
        child_lang = child_entry.get("lang_code")
        child_exp = child_entry.get("expansion") or child_ref.get("expansion")
        child_tree = build_descendant_hierarchy(
            child_word,
            f,
            lang_code=child_lang,
            depth=depth + 1,
            visited=visited,
            max_depth=max_depth,
            node_budget=node_budget,
        )

        logger.debug("built child tree for %r lang=%r -> %d children", child_word, child_lang, len(child_tree.get("children", [])))

        results.append(
            {
                "word": child_word,
                "lang_code": child_lang,
                "expansion": child_exp,
                "children": child_tree.get("children", []),
            }
        )

        if node_budget.get("remaining", 0) <= 0:
            node_budget["truncated"] = True
            break

    logger.info("finished %r: found %d children at depth %d", word, len(results), depth)
    return {"name": word, "children": results}
