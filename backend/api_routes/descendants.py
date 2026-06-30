import mmap, json
import logging
import time
import unicodedata
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import index, JSONL_FILE_PATH
from services.wiktionary_io import find_root_ancestor, build_descendant_hierarchy

logger = logging.getLogger("descendants_api")
logging.basicConfig(level=logging.INFO)

router = APIRouter()

# Lightweight process-local cache to reduce repeated heavy traversals.
CACHE_TTL_SECONDS = 180
CACHE_MAX_ENTRIES = 512
_response_cache = {}


def _cache_key(prefix: str, payload: dict):
    items = sorted(payload.items(), key=lambda x: x[0])
    return f"{prefix}|{items}"


def _cache_get(key: str):
    item = _response_cache.get(key)
    if not item:
        return None
    expires_at, value = item
    if expires_at <= time.time():
        _response_cache.pop(key, None)
        return None
    return value


def _cache_set(key: str, value):
    now = time.time()
    _response_cache[key] = (now + CACHE_TTL_SECONDS, value)
    # Evict oldest expiration entries when cache grows too large.
    if len(_response_cache) <= CACHE_MAX_ENTRIES:
        return
    for k, _ in sorted(_response_cache.items(), key=lambda kv: kv[1][0])[: max(1, CACHE_MAX_ENTRIES // 8)]:
        _response_cache.pop(k, None)


def _add_elapsed_ms(payload: dict, started_at: float):
    meta = payload.setdefault("meta", {})
    meta["elapsed_ms"] = round((time.perf_counter() - started_at) * 1000, 1)
    return payload

def _offset_from_index_value(val):
    """Return an integer file offset for an index value which may be int or list/tuple."""
    if isinstance(val, (list, tuple)):
        if not val:
            raise ValueError("empty index offset list")
        return val[0]
    return int(val)

def _find_index_key_for(w: str):
    """Best-effort: find any index key that starts with the provided word + '_' (case-insensitive)."""
    for variant in _index_word_variants(w):
        wk = f"{variant}_"
        for k in index:
            if k.startswith(wk):
                return k
    return None


def _find_index_keys_for_word(w: str, lang_code: str = None, max_keys: int = 200):
    out = []
    lang_key = _normalize_index_word(lang_code) if lang_code else None
    for variant in _index_word_variants(w):
        if lang_key:
            exact = f"{variant}_{lang_key}"
            if exact in index and exact not in out:
                return [exact]
        wk = f"{variant}_"
        for k in index:
            if not k.startswith(wk):
                continue
            if k not in out:
                out.append(k)
            if len(out) >= max_keys:
                break
        if len(out) >= max_keys:
            break
    return out


def _normalize_index_word(text: str):
    if not text:
        return None
    return str(text).strip().lower()


def _index_word_variants(text: str):
    raw = _normalize_index_word(text)
    if not raw:
        return []
    variants = [raw]
    stripped = "".join(ch for ch in unicodedata.normalize("NFKD", raw) if unicodedata.category(ch) != "Mn")
    if stripped and stripped != raw:
        variants.append(stripped)
    return variants


def _read_entry_by_key(mm, key: str):
    if key not in index:
        return None
    try:
        off = _offset_from_index_value(index[key])
        mm.seek(off)
        return json.loads(mm.readline().decode("utf-8"))
    except Exception:
        return None


def _node_from_entry(entry, fallback_word=None, fallback_lang=None):
    return {
        "word": entry.get("word") if entry else fallback_word,
        "lang_code": entry.get("lang_code") if entry else fallback_lang,
        "expansion": entry.get("expansion") if entry else None,
    }


def _is_proto_like(word, lang_code):
    word_norm = (word or "").strip()
    lang_norm = (lang_code or "").strip().lower() if lang_code else ""
    return word_norm.startswith("*") or (lang_norm and "pro" in lang_norm)


def _candidate_parent_nodes(mm, entry, max_per_step=8):
    """Extract immediate ancestor candidates from etymology templates.

    Returns unique candidate nodes in precedence order (deepest template first).
    """
    templates = (entry or {}).get("etymology_templates", []) or []
    out = []
    seen = set()

    for tpl in reversed(templates):
        if not isinstance(tpl, dict):
            continue
        if (tpl.get("name") or "").strip().lower() == "etymon":
            continue
        args = tpl.get("args") or {}
        cand_word = args.get("3")
        cand_lang = args.get("2")
        tr = args.get("tr")
        use_word = tr or cand_word
        if not use_word:
            continue

        parent_word = str(use_word).strip()
        parent_lang = str(cand_lang).strip().lower() if cand_lang else None
        key = f"{parent_word.lower()}_{parent_lang or ''}"
        if key in seen:
            continue
        seen.add(key)
        out.append({"word": parent_word, "lang_code": parent_lang})
        if len(out) >= max_per_step:
            break

    return out


def _trace_ancestry_paths(mm, start_key: str, max_depth=10, max_paths=20, max_branching=5):
    """Depth-limited DFS over etymology templates to discover root candidates.

    Returns paths as arrays of nodes from descendant -> ancestor/root.
    """
    start_entry = _read_entry_by_key(mm, start_key)
    if not start_entry:
        return []

    paths = []
    stack = [
        (
            start_entry,
            [_node_from_entry(start_entry)],
            {start_key},
            0,
        )
    ]

    while stack and len(paths) < max_paths:
        current_entry, path, seen_keys, depth = stack.pop()
        if depth >= max_depth:
            paths.append(path)
            continue

        parent_candidates = _candidate_parent_nodes(mm, current_entry, max_per_step=max_branching)
        if not parent_candidates:
            paths.append(path)
            continue

        advanced = False
        for parent in parent_candidates:
            p_word = parent.get("word")
            p_lang = parent.get("lang_code")
            if not p_word:
                continue

            parent_keys = _find_index_keys_for_word(p_word, p_lang, max_keys=max_branching)
            if not parent_keys:
                parent_node = {"word": p_word, "lang_code": p_lang, "expansion": None}
                paths.append(path + [parent_node])
                continue

            for p_key in parent_keys:
                if len(paths) >= max_paths:
                    break
                if p_key in seen_keys:
                    continue
                p_entry = _read_entry_by_key(mm, p_key)
                if not p_entry:
                    continue
                advanced = True
                next_seen = set(seen_keys)
                next_seen.add(p_key)
                stack.append((p_entry, path + [_node_from_entry(p_entry)], next_seen, depth + 1))

        if not advanced:
            paths.append(path)

    return paths[:max_paths]


def _resolve_ancestor_roots(mm, word: str, lang_code: str, max_depth: int, max_paths: int, max_branching: int):
    start_keys = _find_index_keys_for_word(word, lang_code, max_keys=max_branching)
    if not start_keys:
        return [], []

    all_paths = []
    for s_key in start_keys:
        if len(all_paths) >= max_paths:
            break
        sub_paths = _trace_ancestry_paths(
            mm,
            s_key,
            max_depth=max_depth,
            max_paths=max_paths - len(all_paths),
            max_branching=max_branching,
        )
        all_paths.extend(sub_paths)

    roots_by_key = {}
    for p in all_paths:
        if not p:
            continue
        root_index = len(p) - 1
        root_node = p[-1]
        for rev_idx, node in enumerate(reversed(p)):
            node_word = (node.get("word") or "").strip()
            node_lang = (node.get("lang_code") or "").strip().lower() if node.get("lang_code") else None
            if _is_proto_like(node_word, node_lang):
                continue
            root_index = len(p) - 1 - rev_idx
            root_node = node
            break

        r_word = (root_node.get("word") or "").strip()
        r_lang = (root_node.get("lang_code") or "").strip().lower() if root_node.get("lang_code") else None
        if not r_word:
            continue
        r_key = f"{r_word.lower()}_{r_lang or ''}"
        root_info = roots_by_key.get(r_key)
        if not root_info:
            root_info = {
                "word": r_word,
                "lang_code": r_lang,
                "supporting_paths": 0,
                "max_path_length": 0,
                "max_root_index": 0,
                "proto_score": 1 if _is_proto_like(r_word, r_lang) else 0,
            }
            roots_by_key[r_key] = root_info

        root_info["supporting_paths"] += 1
        root_info["max_path_length"] = max(root_info["max_path_length"], len(p))
        root_info["max_root_index"] = max(root_info["max_root_index"], root_index)

    roots = list(roots_by_key.values())
    roots.sort(
        key=lambda r: (
            r.get("max_root_index", 0),
            r.get("proto_score", 0),
            r.get("max_path_length", 0),
            r.get("supporting_paths", 0),
        ),
        reverse=True,
    )
    return roots, all_paths


def _flatten_paths_from_tree(tree, root_word, root_lang=None, max_paths=1000):
    paths = []

    def walk(node, acc):
        if len(paths) >= max_paths:
            return
        cur = {
            "word": node.get("word") or node.get("name"),
            "lang_code": node.get("lang_code"),
            "expansion": node.get("expansion"),
        }
        new_acc = acc + [cur]
        children = node.get("children", []) or []
        if not children:
            paths.append(new_acc)
            return
        for c in children:
            walk(c, new_acc)

    top_children = tree.get("children", []) if isinstance(tree, dict) else []
    root_node = {"word": root_word, "lang_code": root_lang}
    if top_children:
        for child in top_children:
            if len(paths) >= max_paths:
                break
            walk(child, [root_node])
    else:
        paths.append([root_node])
    return paths


def _aggregate_descendant_tree(node, branch_limit: int = 8, max_depth: int = 4, depth: int = 0):
    """Collapse wide branches into summary cluster nodes for overview-first rendering.

    The returned structure preserves node metadata but replaces extra children with an
    aggregated summary marker so the UI can render a compact overview.
    """
    if not isinstance(node, dict):
        return node

    children = node.get("children", []) or []
    next_children = []

    for idx, child in enumerate(children):
        if depth >= max_depth:
            next_children = children
            break
        if idx < branch_limit:
            next_children.append(
                _aggregate_descendant_tree(
                    child,
                    branch_limit=branch_limit,
                    max_depth=max_depth,
                    depth=depth + 1,
                )
            )
        else:
            break

    remaining = max(0, len(children) - branch_limit)
    if remaining > 0:
        next_children.append(
            {
                "word": f"{remaining} more branches",
                "lang_code": node.get("lang_code"),
                "expansion": f"Aggregated {remaining} descendant branches",
                "children": [],
                "aggregated": True,
                "count": remaining,
            }
        )

    aggregated = dict(node)
    aggregated["children"] = next_children
    aggregated["aggregated"] = len(children) > branch_limit
    aggregated["count"] = len(children)
    return aggregated

@router.get("/descendant-tree")
async def get_descendant_tree(
    word: str,
    lang_code: str,
    max_depth: int = Query(8, ge=1, le=30),
    max_nodes: int = Query(1200, ge=10, le=20000),
):
    """Return a descendant tree for the provided word+lang_code.
    The response is the tree object (JSON-serializable dict)."""
    key = f"{word.lower()}_{lang_code.lower()}"
    if key not in index:
        return JSONResponse(content={"error": "Word not found."}, status_code=404)
    mm = None
    started_at = time.perf_counter()
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            off = _offset_from_index_value(index[key])
            mm.seek(off)
            entry = json.loads(mm.readline().decode("utf-8"))

            # Prefer the deepest explicit etymology template ancestor (args['3'] or transliteration 'tr').
            root = None
            templates = entry.get("etymology_templates", []) or []
            deepest_tpl = None
            for tpl in templates:
                if not tpl or not isinstance(tpl, dict):
                    continue
                args = tpl.get("args") or {}
                if args.get("3"):
                    deepest_tpl = tpl

            if deepest_tpl:
                args = deepest_tpl.get("args") or {}
                cand_word = args.get("3")
                tr = args.get("tr")
                root = tr or cand_word
            if not root:
                # Fallback to existing helper
                root = find_root_ancestor(entry, mm)

            logger.info("/descendant-tree request word=%s lang=%s -> root=%s (chosen)", word, lang_code, root)
            budget = {"remaining": max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(root, mm, lang_code=lang_code, max_depth=max_depth, node_budget=budget)
            logger.info("/descendant-tree built tree for root=%s children=%d", root, len(tree.get("children", [])))
            payload = {
                "root": root,
                "tree": tree,
                "meta": {
                    "max_depth": max_depth,
                    "max_nodes": max_nodes,
                    "truncated": bool(budget.get("truncated")),
                },
            }
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()

@router.get("/descendant-tree-from-root")
async def descendant_tree_from_root(
    word: str,
    lang_code: str,
    max_depth: int = Query(8, ge=1, le=30),
    max_nodes: int = Query(1200, ge=10, le=20000),
):
    """Build a descendant tree starting from an explicit root word (optionally with lang_code)."""
    mm = None
    started_at = time.perf_counter()
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            logger.info("/descendant-tree-from-root request root=%s lang=%s", word, lang_code)
            budget = {"remaining": max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(
                word,
                mm,
                lang_code=lang_code,
                max_depth=max_depth,
                node_budget=budget,
            )
            logger.info("/descendant-tree-from-root built tree for root=%s children=%d", word, len(tree.get("children", [])))
            payload = {
                "root": word,
                "root_lang": lang_code,
                "tree": tree,
                "meta": {
                    "max_depth": max_depth,
                    "max_nodes": max_nodes,
                    "truncated": bool(budget.get("truncated")),
                },
            }
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-paths-from-root")
async def descendant_paths_from_root(
    word: str,
    lang_code: str = None,
    max_depth: int = Query(8, ge=1, le=30),
    max_nodes: int = Query(1600, ge=10, le=30000),
    max_paths: int = Query(1000, ge=1, le=20000),
):
    """Return an array of linear descendant paths (arrays of nodes) starting at provided root.

    Each node is a dict with keys: `word`, `lang_code`, `expansion` (when available).
    """
    mm = None
    started_at = time.perf_counter()
    try:
        cache_key = _cache_key(
            "descendant-paths-from-root",
            {
                "word": word,
                "lang_code": lang_code,
                "max_depth": max_depth,
                "max_nodes": max_nodes,
                "max_paths": max_paths,
            },
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            # Attempt to backtrace to furthest ancestor when possible.
            root_word = word
            root_lang = None

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
                off = _offset_from_index_value(index[orig_key])
                mm.seek(off)
                try:
                    entry = json.loads(mm.readline().decode("utf-8"))
                except Exception:
                    entry = None

            # If we have an entry, prefer the deepest etymology template as the ancestor root
            if entry:
                templates = entry.get("etymology_templates", []) or []
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
            logger.info("/descendant-paths-from-root starting root=%s lang=%s", root_word, lang_code)
            budget = {"remaining": max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(
                root_word,
                mm,
                lang_code=root_lang or lang_code,
                max_depth=max_depth,
                node_budget=budget,
            )

            # Try to infer a language code for the root (best-effort)
            k_for_root = _find_index_key_for(root_word)
            if k_for_root:
                # key format: '<word>_<langcode>'
                parts = k_for_root.split("_", 1)
                if len(parts) > 1:
                    root_lang = parts[1]

            paths = _flatten_paths_from_tree(tree, root_word=root_word, root_lang=root_lang or lang_code, max_paths=max_paths)

            payload = {
                "root": root_word,
                "root_lang": root_lang,
                "paths": paths,
                "meta": {
                    "max_depth": max_depth,
                    "max_nodes": max_nodes,
                    "max_paths": max_paths,
                    "truncated": bool(budget.get("truncated")) or len(paths) >= max_paths,
                },
            }
            _cache_set(cache_key, payload)
            return JSONResponse(content=_add_elapsed_ms(payload, started_at))
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-preview")
async def descendant_preview(
    word: str,
    lang_code: str = None,
    depth: int = Query(2, ge=1, le=5),
    max_nodes: int = Query(500, ge=10, le=5000),
):
    """Return a bounded shallow preview tree for overview-first rendering."""
    mm = None
    started_at = time.perf_counter()
    try:
        cache_key = _cache_key(
            "descendant-preview",
            {"word": word, "lang_code": lang_code, "depth": depth, "max_nodes": max_nodes},
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            budget = {"remaining": max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(
                word,
                mm,
                lang_code=lang_code,
                max_depth=depth,
                node_budget=budget,
            )

            payload = {
                "root": word,
                "root_lang": lang_code,
                "tree": tree,
                "meta": {
                    "depth": depth,
                    "max_nodes": max_nodes,
                    "truncated": bool(budget.get("truncated")),
                },
            }
            _cache_set(cache_key, payload)
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-count")
async def descendant_count(
    word: str,
    lang_code: str = None,
    max_nodes: int = Query(30000, ge=100, le=200000),
):
    """Return descendant count with hard cap to avoid unbounded traversal cost."""
    mm = None
    started_at = time.perf_counter()
    try:
        cache_key = _cache_key(
            "descendant-count",
            {"word": word, "lang_code": lang_code, "max_nodes": max_nodes},
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            budget = {"remaining": max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(
                word,
                mm,
                lang_code=lang_code,
                max_depth=30,
                node_budget=budget,
            )

            def _count_nodes(node):
                children = node.get("children", []) or []
                total = len(children)
                for c in children:
                    total += _count_nodes(c)
                return total

            count = _count_nodes(tree)
            payload = {
                "root": word,
                "root_lang": lang_code,
                "descendant_count": count,
                "is_capped": bool(budget.get("truncated")),
                "cap": max_nodes,
            }
            _cache_set(cache_key, payload)
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-tree-aggregated")
async def descendant_tree_aggregated(
    word: str,
    lang_code: str = None,
    max_depth: int = Query(8, ge=1, le=30),
    max_nodes: int = Query(1200, ge=10, le=20000),
    branch_limit: int = Query(8, ge=1, le=100),
    aggregate_depth: int = Query(4, ge=1, le=10),
):
    """Return a descendant tree with wide branches collapsed into cluster summary nodes."""
    mm = None
    started_at = time.perf_counter()
    try:
        cache_key = _cache_key(
            "descendant-tree-aggregated",
            {
                "word": word,
                "lang_code": lang_code,
                "max_depth": max_depth,
                "max_nodes": max_nodes,
                "branch_limit": branch_limit,
                "aggregate_depth": aggregate_depth,
            },
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            # Resolve root the same way as the regular descendant-tree endpoint.
            key = f"{word.lower()}_{lang_code.lower()}" if lang_code else _find_index_key_for(word)
            if not key or key not in index:
                return JSONResponse(content={"error": "Word not found."}, status_code=404)

            off = _offset_from_index_value(index[key])
            mm.seek(off)
            entry = json.loads(mm.readline().decode("utf-8"))

            root = None
            templates = entry.get("etymology_templates", []) or []
            deepest_tpl = None
            for tpl in templates:
                if not tpl or not isinstance(tpl, dict):
                    continue
                args = tpl.get("args") or {}
                if args.get("3"):
                    deepest_tpl = tpl

            if deepest_tpl:
                args = deepest_tpl.get("args") or {}
                cand_word = args.get("3")
                tr = args.get("tr")
                root = tr or cand_word
            if not root:
                root = find_root_ancestor(entry, mm)

            budget = {"remaining": max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(root, mm, lang_code=lang_code, max_depth=max_depth, node_budget=budget)
            aggregated_tree = _aggregate_descendant_tree(tree, branch_limit=branch_limit, max_depth=aggregate_depth)

            payload = {
                "root": root,
                "tree": aggregated_tree,
                "meta": {
                    "max_depth": max_depth,
                    "max_nodes": max_nodes,
                    "branch_limit": branch_limit,
                    "aggregate_depth": aggregate_depth,
                    "truncated": bool(budget.get("truncated")),
                },
            }
            _cache_set(cache_key, payload)
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/ancestor-roots")
async def ancestor_roots(
    word: str,
    lang_code: str = None,
    max_depth: int = Query(8, ge=1, le=20),
    max_paths: int = Query(24, ge=1, le=200),
    max_branching: int = Query(5, ge=1, le=20),
):
    """Resolve likely proto/root candidates by traversing ancestry upward from a word.

    Returns bounded ancestry paths and unique root candidates derived from path ends.
    """
    mm = None
    try:
        cache_key = _cache_key(
            "ancestor-roots",
            {
                "word": word,
                "lang_code": lang_code,
                "max_depth": max_depth,
                "max_paths": max_paths,
                "max_branching": max_branching,
            },
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            roots, all_paths = _resolve_ancestor_roots(
                mm,
                word=word,
                lang_code=lang_code,
                max_depth=max_depth,
                max_paths=max_paths,
                max_branching=max_branching,
            )
            if not all_paths:
                return JSONResponse(content={"error": "Word not found."}, status_code=404)

            payload = {
                "query": {"word": word, "lang_code": lang_code},
                "roots": roots,
                "paths": all_paths,
                "meta": {
                    "max_depth": max_depth,
                    "max_paths": max_paths,
                    "max_branching": max_branching,
                    "path_count": len(all_paths),
                },
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-root")
async def descendant_root(
    word: str,
    lang_code: str = None,
    max_depth: int = Query(8, ge=1, le=20),
    max_paths: int = Query(24, ge=1, le=200),
    max_branching: int = Query(5, ge=1, le=20),
):
    """Resolve the most likely descendant-root candidate without building descendant paths."""
    mm = None
    try:
        cache_key = _cache_key(
            "descendant-root",
            {
                "word": word,
                "lang_code": lang_code,
                "max_depth": max_depth,
                "max_paths": max_paths,
                "max_branching": max_branching,
            },
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            roots, ancestry_paths = _resolve_ancestor_roots(
                mm,
                word=word,
                lang_code=lang_code,
                max_depth=max_depth,
                max_paths=max_paths,
                max_branching=max_branching,
            )
            if not roots:
                return JSONResponse(content={"error": "Word not found."}, status_code=404)

            selected_root = roots[0]
            payload = {
                "query": {"word": word, "lang_code": lang_code},
                "roots": roots,
                "selected_root": selected_root,
                "ancestry_paths": ancestry_paths,
                "root": selected_root.get("word") or word,
                "root_lang": selected_root.get("lang_code") or lang_code,
                "meta": {
                    "max_depth": max_depth,
                    "max_paths": max_paths,
                    "max_branching": max_branching,
                    "path_count": len(ancestry_paths),
                },
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-paths-resolved")
async def descendant_paths_resolved(
    word: str,
    lang_code: str = None,
    preferred_root_word: str = None,
    preferred_root_lang: str = None,
    anc_max_depth: int = Query(8, ge=1, le=20),
    anc_max_paths: int = Query(24, ge=1, le=200),
    anc_max_branching: int = Query(5, ge=1, le=20),
    desc_max_depth: int = Query(8, ge=1, le=30),
    desc_max_nodes: int = Query(1600, ge=10, le=30000),
    desc_max_paths: int = Query(1000, ge=1, le=20000),
):
    """Resolve likely root(s) from a descendant query, then return bounded descendant paths.

    This collapses two frontend calls (ancestor lookup + descendant path fetch) into one.
    """
    mm = None
    started_at = time.perf_counter()
    try:
        cache_key = _cache_key(
            "descendant-paths-resolved",
            {
                "word": word,
                "lang_code": lang_code,
                "preferred_root_word": preferred_root_word,
                "preferred_root_lang": preferred_root_lang,
                "anc_max_depth": anc_max_depth,
                "anc_max_paths": anc_max_paths,
                "anc_max_branching": anc_max_branching,
                "desc_max_depth": desc_max_depth,
                "desc_max_nodes": desc_max_nodes,
                "desc_max_paths": desc_max_paths,
            },
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

            roots, ancestry_paths = _resolve_ancestor_roots(
                mm,
                word=word,
                lang_code=lang_code,
                max_depth=anc_max_depth,
                max_paths=anc_max_paths,
                max_branching=anc_max_branching,
            )

            selected_root = None
            if preferred_root_word:
                pref_word_norm = preferred_root_word.strip().lower()
                pref_lang_norm = preferred_root_lang.strip().lower() if preferred_root_lang else None
                for r in roots:
                    rw = (r.get("word") or "").strip().lower()
                    rl = (r.get("lang_code") or "").strip().lower() if r.get("lang_code") else None
                    if rw == pref_word_norm and (pref_lang_norm is None or rl == pref_lang_norm):
                        selected_root = r
                        break

            if not selected_root:
                selected_root = roots[0] if roots else {"word": word, "lang_code": lang_code}

            root_word = selected_root.get("word") or word
            root_lang = selected_root.get("lang_code") or lang_code

            budget = {"remaining": desc_max_nodes, "truncated": False}
            tree = build_descendant_hierarchy(
                root_word,
                mm,
                lang_code=root_lang,
                max_depth=desc_max_depth,
                node_budget=budget,
            )
            desc_paths = _flatten_paths_from_tree(tree, root_word=root_word, root_lang=root_lang, max_paths=desc_max_paths)

            payload = {
                "query": {"word": word, "lang_code": lang_code},
                "roots": roots,
                "selected_root": selected_root,
                "ancestry_paths": ancestry_paths,
                "paths": desc_paths,
                "meta": {
                    "ancestor": {
                        "max_depth": anc_max_depth,
                        "max_paths": anc_max_paths,
                        "max_branching": anc_max_branching,
                        "path_count": len(ancestry_paths),
                    },
                    "descendant": {
                        "max_depth": desc_max_depth,
                        "max_nodes": desc_max_nodes,
                        "max_paths": desc_max_paths,
                        "truncated": bool(budget.get("truncated")) or len(desc_paths) >= desc_max_paths,
                    },
                },
            }
            _cache_set(cache_key, payload)
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()

# TODO [HIGH LEVEL]: Progressive disclosure support by level/depth and link strength threshold.
# TODO [LOW LEVEL]: Add query params `max_depth`, `min_strength` and compute weights from attested links.
