import mmap, json
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import index, JSONL_FILE_PATH
from services.wiktionary_io import find_root_ancestor, build_descendant_hierarchy

router = APIRouter()

@router.get("/descendant-tree")
async def get_descendant_tree(word: str, lang_code: str):
    key = f"{word.lower()}_{lang_code.lower()}"
    if key not in index:
        return JSONResponse(content={"error": "Word not found."}, status_code=404)
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(index[key][0])
            entry = json.loads(mm.readline().decode("utf-8"))
            root = find_root_ancestor(entry, mm)
            tree = build_descendant_hierarchy(root, mm)
            mm.close()
            return tree
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@router.get("/descendant-tree-from-root")
async def descendant_tree_from_root(word: str, lang_code: str):
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            tree = build_descendant_hierarchy(word, mm, lang_code=lang_code)
            mm.close()
            return tree
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@router.get("/descendant-paths-from-root")
async def descendant_paths_from_root(word: str, lang_code: str = None):
    """Return an array of linear descendant paths (arrays of nodes) starting at provided root.

    Each node is a dict with keys: `word`, `lang_code`, `expansion` (when available).
    """
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            # Attempt to backtrace to furthest ancestor when possible.
            root_word = word
            root_lang = None

            # Helper: find an index key for a given word (any language) and return its offset
            def _find_index_key_for(w: str):
                wk = f"{w.lower()}_"
                for k in index:
                    if k.startswith(wk):
                        return k
                return None

            # Try to read the original provided word's entry (if any) so we can backtrace from it.
            orig_key = None
            if lang_code:
                candidate = f"{word.lower()}_{lang_code.lower()}"
                if candidate in index:
                    orig_key = candidate
            if not orig_key:
                orig_key = _find_index_key_for(word)

            entry = None
            if orig_key:
                off = index[orig_key]
                if isinstance(off, (list, tuple)):
                    off = off[0]
                mm.seek(off)
                try:
                    entry = json.loads(mm.readline().decode("utf-8"))
                except Exception:
                    entry = None

            # If we have an entry, prefer the deepest etymology template as the ancestor root
            if entry:
                templates = entry.get("etymology_templates", [])
                deepest_tpl = None
                # Walk templates in order and keep the last with an explicit ancestor form (args['3'])
                for tpl in templates:
                    if not tpl or not isinstance(tpl, dict):
                        continue
                    args = tpl.get("args") or {}
                    if args.get("3"):
                        deepest_tpl = tpl

                if deepest_tpl:
                    args = deepest_tpl.get("args") or {}
                    cand_word = args.get("3")
                    cand_lang = args.get("2")
                    # Prefer transliteration 'tr' if present (helps when ancestor is in non-Latin script)
                    tr = args.get("tr")
                    use_word = tr or cand_word
                    if isinstance(use_word, str) and use_word:
                        root_word = use_word
                        root_lang = cand_lang or root_lang
                else:
                    # Fallback: try existing helper that follows head_templates
                    try:
                        ancestor = find_root_ancestor(entry, mm)
                        if ancestor:
                            root_word = ancestor
                    except Exception:
                        # keep provided word
                        root_word = word

            # Build hierarchy starting from discovered root_word
            tree = build_descendant_hierarchy(root_word, mm, lang_code=lang_code)

            # Try to infer a language code for the root (best-effort)
            k_for_root = _find_index_key_for(root_word)
            if k_for_root:
                # key format: '<word>_<langcode>'
                parts = k_for_root.split("_", 1)
                if len(parts) > 1:
                    root_lang = parts[1]

            # Flatten tree into list of paths
            paths = []

            def walk(node, acc):
                # node is expected in form {"word":..., "lang_code":..., "children": [...]}
                cur = {"word": node.get("word") or node.get("name"), "lang_code": node.get("lang_code"), "expansion": node.get("expansion")}
                new_acc = acc + [cur]
                children = node.get("children", []) or []
                if not children:
                    paths.append(new_acc)
                    return
                for c in children:
                    walk(c, new_acc)

            top_children = tree.get("children", []) if isinstance(tree, dict) else []
            root_node = {"word": root_word, "lang_code": root_lang or lang_code}
            if top_children:
                for child in top_children:
                    walk(child, [root_node])
            else:
                paths.append([root_node])

            mm.close()
            return JSONResponse(content={"root": root_word, "root_lang": root_lang, "paths": paths})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# TODO [HIGH LEVEL]: Progressive disclosure support by level/depth and link strength threshold.
# TODO [LOW LEVEL]: Add query params `max_depth`, `min_strength` and compute weights from attested links.
