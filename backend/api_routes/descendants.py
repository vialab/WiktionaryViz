import mmap, json
import logging
import time
import unicodedata
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import index, JSONL_FILE_PATH, REVERSE_DESCENDANT_GRAPH_FILE_PATH
from services.wiktionary_io import find_root_ancestor, build_descendant_hierarchy, _extract_child_ref_from_descendant

logger = logging.getLogger("descendants_api")
logging.basicConfig(level=logging.INFO)

router = APIRouter()

# Lightweight process-local cache to reduce repeated heavy traversals.
CACHE_TTL_SECONDS = 180
CACHE_MAX_ENTRIES = 512
_response_cache = {}
_reverse_descendant_graph = None


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
            bare_variant = variant.lstrip("*")
            if bare_variant != variant:
                exact_bare = f"{bare_variant}_{lang_key}"
                if exact_bare in index and exact_bare not in out:
                    return [exact_bare]
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


def _word_variants(text: str):
    raw = _normalize_index_word(text)
    if not raw:
        return []

    variants = [raw]
    bare = raw.lstrip("*")
    if bare and bare not in variants:
        variants.append(bare)
    if bare and f"*{bare}" not in variants:
        variants.append(f"*{bare}")

    deaccented = "".join(ch for ch in unicodedata.normalize("NFKD", bare) if unicodedata.category(ch) != "Mn")
    if deaccented and deaccented not in variants:
        variants.append(deaccented)
    if deaccented and f"*{deaccented}" not in variants:
        variants.append(f"*{deaccented}")

    if bare.startswith("reconstruction:"):
        reconstruction = bare[len("reconstruction:"):].strip()
        if reconstruction and reconstruction not in variants:
            variants.append(reconstruction)
        if reconstruction and f"*{reconstruction}" not in variants:
            variants.append(f"*{reconstruction}")

    return variants


def _lang_variants(lang_code: str | None):
    normalized = _normalize_index_word(lang_code)
    if not normalized:
        return []

    variants = [normalized]
    if "-" in normalized:
        parts = normalized.split("-")
        for end in range(len(parts) - 1, 0, -1):
            prefix = "-".join(parts[:end])
            if prefix not in variants:
                variants.append(prefix)
    return variants


def _graph_key_variants(word: str, lang_code: str | None):
    keys = []
    for word_variant in _word_variants(word):
        for lang_variant in _lang_variants(lang_code):
            key = f"{word_variant}_{lang_variant}"
            if key not in keys:
                keys.append(key)
    return keys


def _load_reverse_descendant_graph():
    global _reverse_descendant_graph
    if _reverse_descendant_graph is not None:
        return _reverse_descendant_graph

    try:
        with open(REVERSE_DESCENDANT_GRAPH_FILE_PATH, "r", encoding="utf-8") as f:
            graph = json.load(f)
            _reverse_descendant_graph = {str(key): set(value or []) for key, value in graph.items()}
    except Exception as exc:
        logger.warning("Failed to build reverse descendant graph: %s", exc)
        _reverse_descendant_graph = {}

    return _reverse_descendant_graph


def _safe_descendant_limits(max_depth: int, max_nodes: int, *, root_click: bool = False):
    """Bound descendant expansion to prevent runaway memory use from root-click or proto-root traversals."""
    depth_limit = max(1, int(max_depth or 1))
    node_limit = max(10, int(max_nodes or 10))

    if root_click:
        return min(depth_limit, 2), min(node_limit, 150)
    return min(depth_limit, 5), min(node_limit, 600)


def _reverse_graph_child_keys(word: str, lang_code: str | None):
    graph = _load_reverse_descendant_graph()
    child_keys = set()
    for parent_key in _graph_key_variants(word, lang_code):
        child_keys.update(graph.get(parent_key, set()))
    return sorted(child_keys)


def _split_graph_key(key: str):
    if not key:
        return None, None
    if "_" in key:
        word, lang = key.rsplit("_", 1)
        return word, lang
    return key, None


def _select_reverse_root_key(word: str, lang_code: str | None, preferred_key: str | None = None):
    graph = _load_reverse_descendant_graph()
    candidates = []

    if preferred_key:
        candidates.append(str(preferred_key).strip().lower())

    for variant in _graph_key_variants(word, lang_code):
        if variant not in candidates:
            candidates.append(variant)

    for index_key in _find_index_keys_for_word(word, lang_code, max_keys=64):
        if index_key not in candidates:
            candidates.append(index_key)

    # Prefer candidates that actually have descendants in the reverse graph.
    for key in candidates:
        if graph.get(key):
            return key

    # If none have children, still return a known graph key when available.
    for key in candidates:
        if key in graph:
            return key

    return None


def _reverse_tree_node_from_key(root_key: str, max_depth: int, node_budget: dict, depth: int = 0, seen: set | None = None):
    graph = _load_reverse_descendant_graph()
    if seen is None:
        seen = set()

    word, lang_code = _split_graph_key(root_key)
    node = {"word": word, "lang_code": lang_code, "expansion": None, "children": []}

    if depth >= max_depth:
        return node

    if node_budget.get("remaining", 0) <= 0:
        node_budget["truncated"] = True
        return node

    for child_key in sorted(graph.get(root_key, set())):
        if node_budget.get("remaining", 0) <= 0:
            node_budget["truncated"] = True
            break
        if child_key in seen:
            continue

        node_budget["remaining"] = max(0, node_budget.get("remaining", 0) - 1)
        next_seen = set(seen)
        next_seen.add(child_key)
        child_node = _reverse_tree_node_from_key(child_key, max_depth, node_budget, depth + 1, next_seen)
        node["children"].append(child_node)

    return node


def _reverse_tree_node(word: str, lang_code: str | None, max_depth: int, node_budget: dict, depth: int = 0, seen: set | None = None):
    if seen is None:
        seen = set()

    if depth >= max_depth:
        return {"word": word, "lang_code": lang_code, "expansion": None, "children": []}

    if node_budget.get("remaining", 0) <= 0:
        node_budget["truncated"] = True
        return {"word": word, "lang_code": lang_code, "expansion": None, "children": []}

    node = {"word": word, "lang_code": lang_code, "expansion": None, "children": []}
    for child_key in _reverse_graph_child_keys(word, lang_code):
        if node_budget.get("remaining", 0) <= 0:
            node_budget["truncated"] = True
            break
        if child_key in seen:
            continue

        if "_" in child_key:
            child_word, child_lang = child_key.rsplit("_", 1)
        else:
            child_word, child_lang = child_key, None

        node_budget["remaining"] = max(0, node_budget.get("remaining", 0) - 1)
        next_seen = set(seen)
        next_seen.add(child_key)
        child_node = _reverse_tree_node(child_word, child_lang, max_depth, node_budget, depth + 1, next_seen)
        node["children"].append(child_node)

    return node


def _immediate_descendants_for_node(word: str, lang_code: str | None, max_children: int = 12, root_key: str | None = None):
    """Return only the next immediate descendants of a node, bounded and suitable for on-demand expansion."""
    graph = _load_reverse_descendant_graph()
    if not graph:
        logger.info("descendant child lookup: graph empty for word=%r lang=%r root_key=%r", word, lang_code, root_key)
        return []

    candidate_keys = []
    raw_root_key = str(root_key).strip().lower() if root_key else None
    if raw_root_key:
        candidate_keys.append(raw_root_key)
        stripped_root = raw_root_key.lstrip("*")
        if stripped_root and f"*{stripped_root}" not in candidate_keys:
            candidate_keys.append(f"*{stripped_root}")
    for candidate in _graph_key_variants(word, lang_code):
        if candidate not in candidate_keys:
            candidate_keys.append(candidate)

    logger.info("descendant child lookup: word=%r lang=%r root_key=%r candidate_keys=%s", word, lang_code, root_key, candidate_keys)

    seen = set()
    children = []
    for candidate_key in candidate_keys:
        for child_key in sorted(graph.get(candidate_key, set())):
            if len(children) >= max_children:
                break
            if child_key in seen:
                continue

            child_word, child_lang = _split_graph_key(child_key)
            if not child_word:
                continue

            seen.add(child_key)
            children.append({
                "word": child_word,
                "lang_code": child_lang,
                "key": child_key,
                "expansion": None,
            })

        if len(children) >= max_children:
            break

    logger.info("descendant child lookup result: word=%r lang=%r root_key=%r children=%d", word, lang_code, root_key, len(children))
    return children


def _index_word_variants(text: str):
    raw = _normalize_index_word(text)
    if not raw:
        return []

    variants = [raw]

    # Reconstructed forms in the etymology templates commonly carry a leading "*"
    # while the index stores the same form without that marker.
    base = raw.lstrip("*")
    if base and base != raw:
        variants.append(base)

    stripped = "".join(ch for ch in unicodedata.normalize("NFKD", base) if unicodedata.category(ch) != "Mn")
    if stripped and stripped not in variants:
        variants.append(stripped)

    if base.startswith("reconstruction:"):
        bare = base[len("reconstruction:"):].strip()
        if bare and bare not in variants:
            variants.append(bare)

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


def _node_from_entry(entry, fallback_word=None, fallback_lang=None, fallback_key=None):
    word = entry.get("word") if entry else fallback_word
    lang_code = entry.get("lang_code") if entry else fallback_lang
    node_key = None
    if word:
        word_key = str(word).strip().lower()
        lang_key = str(lang_code).strip().lower() if lang_code else ""
        node_key = f"{word_key}_{lang_key}" if lang_key else word_key
    if fallback_key:
        node_key = fallback_key
    return {
        "word": word,
        "lang_code": lang_code,
        "expansion": entry.get("expansion") if entry else None,
        "node_key": node_key,
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
            [_node_from_entry(start_entry, fallback_key=start_key)],
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
                fallback_node_key = _select_reverse_root_key(p_word, p_lang)
                parent_node = {
                    "word": p_word,
                    "lang_code": p_lang,
                    "expansion": None,
                    "node_key": fallback_node_key,
                }
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
                stack.append((p_entry, path + [_node_from_entry(p_entry, fallback_key=p_key)], next_seen, depth + 1))

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

        r_word = (root_node.get("word") or "").strip()
        r_lang = (root_node.get("lang_code") or "").strip().lower() if root_node.get("lang_code") else None
        if not r_word:
            continue
        r_key = f"{r_word.lower()}_{r_lang or ''}"
        root_info = roots_by_key.get(r_key)
        if not root_info:
            root_key = root_node.get("node_key") or _select_reverse_root_key(r_word, r_lang)
            root_info = {
                "word": r_word,
                "lang_code": r_lang,
                "root_key": root_key,
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
            r.get("proto_score", 0),
            r.get("max_root_index", 0),
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
def get_descendant_tree(
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
def descendant_tree_from_root(
    word: str,
    lang_code: str,
    root_key: str = None,
    max_depth: int = Query(8, ge=1, le=30),
    max_nodes: int = Query(1200, ge=10, le=20000),
):
    """Build a descendant tree starting from an explicit root word (optionally with lang_code)."""
    mm = None
    started_at = time.perf_counter()
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            effective_depth, effective_nodes = _safe_descendant_limits(max_depth, max_nodes, root_click=bool(root_key) or _is_proto_like(word, lang_code))
            logger.info("/descendant-tree-from-root request root=%s lang=%s depth=%s nodes=%s", word, lang_code, effective_depth, effective_nodes)
            budget = {"remaining": effective_nodes, "truncated": False}
            selected_root_key = _select_reverse_root_key(word, lang_code, preferred_key=root_key)

            # Proto-like or non-attested roots should expand from the reverse graph first.
            use_graph_first = bool(root_key) or _is_proto_like(word, lang_code)

            tree = {"name": word, "children": []}
            if not use_graph_first:
                tree = build_descendant_hierarchy(
                    word,
                    mm,
                    lang_code=lang_code,
                    max_depth=effective_depth,
                    node_budget=budget,
                )

            if use_graph_first or not tree.get("children"):
                if selected_root_key:
                    tree = _reverse_tree_node_from_key(selected_root_key, max_depth=effective_depth, node_budget=budget)
                else:
                    tree = _reverse_tree_node(word, lang_code, max_depth=effective_depth, node_budget=budget)
            logger.info("/descendant-tree-from-root built tree for root=%s children=%d", word, len(tree.get("children", [])))
            payload = {
                "root": word,
                "root_lang": lang_code,
                "root_key": selected_root_key,
                "tree": tree,
                "meta": {
                    "max_depth": effective_depth,
                    "max_nodes": effective_nodes,
                    "truncated": bool(budget.get("truncated")) or effective_depth < max_depth or effective_nodes < max_nodes,
                },
            }
            return _add_elapsed_ms(payload, started_at)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-children")
def descendant_children(
    word: str,
    lang_code: str = None,
    root_key: str = None,
    max_children: int = Query(12, ge=1, le=50),
):
    """Return only the immediate descendants for the supplied node, which is the safe on-demand expansion primitive."""
    logger.info("GET /descendant-children: word=%r lang=%r root_key=%r max_children=%s", word, lang_code, root_key, max_children)
    children = _immediate_descendants_for_node(word, lang_code, max_children=max_children, root_key=root_key)
    payload = {
        "root": {"word": word, "lang_code": lang_code, "root_key": root_key},
        "children": children,
        "meta": {"max_children": max_children, "count": len(children)},
    }
    logger.info("GET /descendant-children response JSON: %s", json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return payload


@router.get("/descendant-paths-from-root")
def descendant_paths_from_root(
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
def descendant_preview(
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
def descendant_count(
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
def descendant_tree_aggregated(
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
def ancestor_roots(
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
def descendant_root(
    word: str,
    lang_code: str = None,
    max_depth: int = Query(8, ge=1, le=20),
    max_paths: int = Query(24, ge=1, le=200),
    max_branching: int = Query(5, ge=1, le=20),
):
    """Resolve the most likely descendant-root candidate without building descendant paths."""
    mm = None
    started_at = time.perf_counter()
    logger.info("GET /descendant-root start word=%r lang=%r depth=%s paths=%s branching=%s", word, lang_code, max_depth, max_paths, max_branching)
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
            logger.info("GET /descendant-root cache hit word=%r lang=%r elapsed_ms=%.1f", word, lang_code, (time.perf_counter() - started_at) * 1000)
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
            logger.info(
                "GET /descendant-root ancestry complete word=%r roots=%s paths=%s elapsed_ms=%.1f",
                word,
                len(roots),
                len(ancestry_paths),
                (time.perf_counter() - started_at) * 1000,
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
            logger.info(
                "GET /descendant-root complete word=%r selected_root=%r elapsed_ms=%.1f",
                word,
                payload["root"],
                (time.perf_counter() - started_at) * 1000,
            )
            _cache_set(cache_key, payload)
            return payload
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        if mm is not None:
            mm.close()


@router.get("/descendant-paths-resolved")
def descendant_paths_resolved(
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
            effective_depth, effective_nodes = _safe_descendant_limits(desc_max_depth, desc_max_nodes, root_click=False)

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

            budget = {"remaining": effective_nodes, "truncated": False}
            tree = build_descendant_hierarchy(
                root_word,
                mm,
                lang_code=root_lang,
                max_depth=effective_depth,
                node_budget=budget,
            )
            desc_paths = _flatten_paths_from_tree(tree, root_word=root_word, root_lang=root_lang, max_paths=min(desc_max_paths, 400))

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
                        "max_depth": effective_depth,
                        "max_nodes": effective_nodes,
                        "max_paths": min(desc_max_paths, 400),
                        "truncated": bool(budget.get("truncated")) or len(desc_paths) >= min(desc_max_paths, 400),
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
