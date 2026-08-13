import json
import mmap
import math
from collections import defaultdict
from typing import List, Dict, Any
from constants import JSONL_FILE_PATH, index, DATA_DIR
from services.wiktionary_io import build_descendant_hierarchy
import os

# Simple, deterministic recommendation helpers (no training).
# - Per-language min/max normalization computed lazily from `index` + JSONL.
# - Weighted linear scoring with path-length decay and per-feature contribution breakdown.


_language_stats = {}
# Try to load precomputed language stats if available
_language_stats_path = os.path.join(DATA_DIR, "language_stats.json")
if os.path.exists(_language_stats_path):
    try:
        with open(_language_stats_path, "r", encoding="utf-8") as f:
            _language_stats = json.load(f)
    except Exception:
        _language_stats = {}


def _log1p(x):
    try:
        return math.log1p(max(0, float(x)))
    except Exception:
        return 0.0


def _ensure_language_stats(lang_code: str):
    """Compute simple min/max stats for heavy-tailed features for a language.
    This is a lightweight pass over the index offsets for the language and cached in memory.
    """
    if not lang_code:
        lang_code = ""
    if lang_code in _language_stats:
        return _language_stats[lang_code]

    counts = []
    trans = []
    # iterate index keys for language suffix
    for k, off in index.items():
        if not k.endswith(f"_{lang_code}"):
            continue
        try:
            off_int = off[0] if isinstance(off, (list, tuple)) else int(off)
        except Exception:
            continue
        counts.append(off_int)

    stats = {"desc_min": 0.0, "desc_max": 1.0, "trans_min": 0.0, "trans_max": 1.0}
    # We don't parse full JSONL for a full dataset scan in this simple prototype (keeps startup cheap).
    # Use placeholder equal ranges; callers should pass candidate-level values and we'll normalize
    # relatively when language-level stats aren't available.
    _language_stats[lang_code] = stats
    return stats


def _normalize(value: float, vmin: float, vmax: float):
    if vmax <= vmin:
        return 0.0
    return max(0.0, min(1.0, (value - vmin) / (vmax - vmin)))


def _percentile_from_quantiles(quantiles: Dict[str, float], value: float) -> float:
    """Approximate percentile (0..1) for value using stored quantiles dict keyed by percent strings."""
    if not quantiles:
        return 0.0
    try:
        # convert to list of (p, val) sorted
        items = sorted([(int(k), float(v)) for k, v in quantiles.items()])
    except Exception:
        return 0.0
    if value <= items[0][1]:
        return items[0][0] / 100.0
    for i in range(len(items) - 1):
        p0, v0 = items[i]
        p1, v1 = items[i + 1]
        if v0 <= value <= v1:
            # linear interpolate percentile
            if v1 == v0:
                return p0 / 100.0
            frac = (value - v0) / (v1 - v0)
            return (p0 + frac * (p1 - p0)) / 100.0
    return items[-1][0] / 100.0


def map_count_to_percentile(lang_code: str | None, value: float, kind: str = "translations") -> float:
    if not lang_code:
        return 0.0
    lang = str(lang_code).strip()
    stats = _language_stats.get(lang)
    if not stats:
        return 0.0
    kind_stats = stats.get(kind) or {}
    return _percentile_from_quantiles(kind_stats, value)


def _read_entry(word: str, lang_code: str | None):
    """Read an entry from JSONL using the global `index` mapping. Returns dict or None."""
    if not word:
        return None
    key_variants = []
    # try exact key
    lang = (lang_code or "").strip().lower()
    try:
        if lang:
            k = f"{word.lower()}_{lang}"
            if k in index:
                key_variants.append(k)
    except Exception:
        pass
    # fallback: try any index key that starts with word_
    for k in index:
        if k.startswith(f"{word.lower()}_"):
            key_variants.append(k)
            break

    if not key_variants:
        return None

    try:
        off = index[key_variants[0]]
        off_int = off[0] if isinstance(off, (list, tuple)) else int(off)
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(off_int)
            try:
                entry = json.loads(mm.readline().decode("utf-8"))
            except Exception:
                entry = None
            mm.close()
            return entry
    except Exception:
        return None


def node_interest_from_entry(entry: Dict[str, Any]) -> float:
    """Compute a simple interest score for a node entry in [0,1].

    Heuristic features:
    - has_expansion (0/1)
    - translations_count (log1p)
    - descendants_count (log1p)
    - shorter entries get slightly lower weight
    """
    if not entry:
        return 0.0
    has_exp = 1.0 if entry.get("expansion") else 0.0
    trans_count = 0
    # try common translation shapes
    if entry.get("translations") and isinstance(entry.get("translations"), list):
        trans_count = len(entry.get("translations") or [])
    # also consider senses -> translations
    if not trans_count:
        senses = entry.get("senses") or []
        for s in senses:
            if isinstance(s, dict):
                if s.get("translations") and isinstance(s.get("translations"), list):
                    trans_count += len(s.get("translations"))

    desc_count = len((entry.get("descendants") or []) or [])

    t = _log1p(trans_count)
    d = _log1p(desc_count)
    # combine: favor nodes that have expansion + translations or descendants
    raw = 0.45 * has_exp + 0.35 * (t / (1 + t)) + 0.2 * (d / (1 + d))
    return max(0.0, min(1.0, raw))


def compute_candidate_path_scores(root_word: str, root_lang: str | None, candidates: List[Dict[str, Any]], max_depth: int = 6, decay: float = 0.8) -> Dict[str, float]:
    """Build descendant tree from root and compute decay-weighted path_score for candidates.

    Returns a mapping candidate_key -> path_score (0..1).
    Candidate key is lowercased 'word_lang' when lang is present, otherwise word alone.
    """
    scores = {}
    try:
        # build tree (prefer explicit JSONL-based descendants)
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            tree = build_descendant_hierarchy(root_word, f, lang_code=root_lang, max_depth=max_depth, node_budget={"remaining": 2000, "truncated": False})

        # lazy flatten paths (use JSONL-based tree first)
        def _flatten_paths_from_tree_local(tree_obj, root_word, root_lang, max_paths=2000):
            paths_local = []

            def walk(node, acc):
                cur = {"word": node.get("word") or node.get("name"), "lang_code": node.get("lang_code")}
                new_acc = acc + [cur]
                children = node.get("children", []) or []
                if not children:
                    paths_local.append(new_acc)
                    return
                for c in children:
                    walk(c, new_acc)

            top_children = tree_obj.get("children", []) if isinstance(tree_obj, dict) else []
            root_node = {"word": root_word, "lang_code": root_lang}
            if top_children:
                for child in top_children:
                    if len(paths_local) >= max_paths:
                        break
                    walk(child, [root_node])
            else:
                paths_local.append([root_node])
            return paths_local

        paths = _flatten_paths_from_tree_local(tree, root_word=root_word, root_lang=root_lang, max_paths=2000)

        # If explicit JSONL-based tree produced only the trivial root (no children),
        # try the reverse descendant graph fallback to discover supporting paths.
        trivial = True
        for p in paths:
            if len(p) > 1:
                trivial = False
                break
        if trivial:
            try:
                # Avoid importing FastAPI-dependent route helpers here. Read the precomputed
                # reverse descendant graph directly and build a small reverse-tree for paths.
                from constants import REVERSE_DESCENDANT_GRAPH_FILE_PATH
                import unicodedata

                def normalize(s):
                    return str(s).strip().lower() if s else ""

                def index_word_variants(text):
                    raw = normalize(text)
                    if not raw:
                        return []
                    variants = [raw]
                    base = raw.lstrip("*")
                    if base and base != raw:
                        variants.append(base)
                    stripped = "".join(ch for ch in unicodedata.normalize("NFKD", base) if unicodedata.category(ch) != "Mn")
                    if stripped and stripped not in variants:
                        variants.append(stripped)
                    if base.startswith("reconstruction:"):
                        bare = base[len("reconstruction:") :].strip()
                        if bare and bare not in variants:
                            variants.append(bare)
                    return variants

                def lang_variants(lang_code):
                    normalized = normalize(lang_code)
                    if not normalized:
                        return [""]
                    variants = [normalized]
                    if "-" in normalized:
                        parts = normalized.split("-")
                        for end in range(len(parts) - 1, 0, -1):
                            prefix = "-".join(parts[:end])
                            if prefix not in variants:
                                variants.append(prefix)
                    return variants

                def graph_key_variants(word, lang_code):
                    keys = []
                    for w in index_word_variants(word):
                        for l in lang_variants(lang_code):
                            key = f"{w}_{l}" if l else w
                            if key not in keys:
                                keys.append(key)
                    return keys

                def build_reverse_tree(graph, root_key, max_depth=6):
                    seen = set()

                    def build(key, depth):
                        if depth >= max_depth:
                            if "_" in key:
                                w, l = key.split("_", 1)
                            else:
                                w, l = key, None
                            return {"word": w, "lang_code": l, "children": []}
                        children = []
                        for child_key in sorted(graph.get(key, [])):
                            if child_key in seen:
                                continue
                            seen.add(child_key)
                            children.append(build(child_key, depth + 1))
                        if "_" in key:
                            w, l = key.split("_", 1)
                        else:
                            w, l = key, None
                        return {"word": w, "lang_code": l, "children": children}

                def flatten_paths(tree_obj, root_word, root_lang, max_paths=2000):
                    paths_local = []

                    def walk(node, acc):
                        cur = {"word": node.get("word"), "lang_code": node.get("lang_code")}
                        new_acc = acc + [cur]
                        children = node.get("children", []) or []
                        if not children:
                            paths_local.append(new_acc)
                            return
                        for c in children:
                            walk(c, new_acc)

                    top_children = tree_obj.get("children", []) if isinstance(tree_obj, dict) else []
                    root_node = {"word": root_word, "lang_code": root_lang}
                    if top_children:
                        for child in top_children:
                            if len(paths_local) >= max_paths:
                                break
                            walk(child, [root_node])
                    else:
                        paths_local.append([root_node])
                    return paths_local

                if os.path.exists(REVERSE_DESCENDANT_GRAPH_FILE_PATH):
                    print('DEBUG: reverse graph file exists at', REVERSE_DESCENDANT_GRAPH_FILE_PATH)
                    with open(REVERSE_DESCENDANT_GRAPH_FILE_PATH, "r", encoding="utf-8") as gf:
                        graph = json.load(gf)
                    keys = graph_key_variants(root_word, root_lang)
                    sel = None
                    for k in keys:
                        if graph.get(k):
                            sel = k
                            break
                    print('DEBUG: candidate graph keys', keys[:5], 'selected', sel)
                    if sel:
                        print('DEBUG: immediate children count for sel=', len(graph.get(sel, [])))
                        tree = build_reverse_tree(graph, sel, max_depth=max_depth)
                        paths = flatten_paths(tree, root_word, root_lang, max_paths=2000)
            except Exception:
                # ignore fallback failures and continue with original (possibly trivial) paths
                pass

        # map candidates for quick lookup
        cand_keys = {}
        for c in candidates:
            k = (f"{(c.get('word') or '').strip().lower()}_{(c.get('lang_code') or '').strip().lower()}" ).rstrip("_")
            cand_keys[k] = c
            scores[k] = 0.0

        # Build subtree-size map to allow interest estimation when entry lookup fails
        def _build_subtree_counts(node, counts):
            # return total nodes in this subtree (including this node)
            children = node.get("children", []) or []
            total = 1
            for c in children:
                total += _build_subtree_counts(c, counts)
            w = (node.get("word") or "").strip()
            l = (node.get("lang_code") or "").strip().lower() if node.get("lang_code") else ""
            keyname = f"{w.lower()}_{l}".rstrip("_")
            counts[keyname] = max(0, total - 1)
            return total

        subtree_counts = {}
        try:
            top_children = tree.get("children", []) if isinstance(tree, dict) else []
            # make a fake root node to compute subtree counts for its children
            root_node = {"word": root_word, "lang_code": root_lang, "children": top_children}
            _build_subtree_counts(root_node, subtree_counts)
            # DEBUG: inspect subtree_counts for diagnostics
            try:
                print('DEBUG: subtree_counts size', len(subtree_counts))
                sample_keys = list(subtree_counts.keys())[:10]
                print('DEBUG: subtree_counts sample keys', sample_keys)
            except Exception:
                pass
        except Exception:
            subtree_counts = {}

        # For each path, compute interest vector for nodes, then for each candidate on that path compute decay score
        for p in paths:
            # p is list of nodes from root -> ... -> leaf; convert to list of (word,lang)
            node_pairs = []
            for node in p:
                w = (node.get("word") or "").strip()
                l = (node.get("lang_code") or "").strip().lower() if node.get("lang_code") else ""
                node_pairs.append((w, l))

            # compute interest for each node by reading entry
            interests = []
            for w, l in node_pairs:
                ent = _read_entry(w, l if l else None)
                if ent:
                    interests.append(node_interest_from_entry(ent))
                else:
                    # fallback: estimate interest from subtree size when available
                    keyname = f"{w.lower()}_{l}".rstrip("_")
                    sc = float(subtree_counts.get(keyname, 0))
                    if sc <= 0:
                        interests.append(0.0)
                    else:
                        # more responsive scaling: logistic-like mapping of log-counts to [0,1]
                        v = _log1p(sc)
                        # small subtree sizes should still produce meaningful interest; tune factor=0.7
                        interest = (v / (v + 0.7)) * 0.95
                        interests.append(min(1.0, max(0.0, interest)))

            # For each candidate that appears in this path, compute score where sequence is [candidate, parent, ...]
            for idx, (w, l) in enumerate(node_pairs):
                key = f"{w.lower()}_{l}".rstrip("_")
                if key not in scores:
                    continue
                # build reversed interest vector from candidate back to root
                rev = [interests[idx - i] for i in range(idx + 1)]
                s = decay_weighted_score(rev, decay=decay)
                # keep max score across multiple supporting paths
                scores[key] = max(scores.get(key, 0.0), s)

        # If subtree_counts are trivial (e.g., only root present), try a lightweight reverse-graph immediate-child fallback
        try:
            if len(subtree_counts) <= 1:
                from constants import REVERSE_DESCENDANT_GRAPH_FILE_PATH
                if os.path.exists(REVERSE_DESCENDANT_GRAPH_FILE_PATH):
                    with open(REVERSE_DESCENDANT_GRAPH_FILE_PATH, "r", encoding="utf-8") as gf:
                        graph = json.load(gf)
                    for c in candidates:
                        k = (f"{(c.get('word') or '').strip().lower()}_{(c.get('lang_code') or '').strip().lower()}" ).rstrip("_")
                        if k in scores and (not scores.get(k)):
                            sc = float(len(graph.get(k, []) or []))
                            if sc > 0:
                                v = _log1p(sc)
                                interest = (v / (v + 0.7)) * 0.6
                                scores[k] = max(scores.get(k, 0.0), min(1.0, interest))
        except Exception:
            pass

    except Exception as e:
        # on failure, log exception for debugging and return zeros
        try:
            print('compute_candidate_path_scores failed:', repr(e))
        except Exception:
            pass
        return scores

    return scores


def decay_weighted_score(values: List[float], decay: float = 0.85) -> float:
    # values[0] = closest node, values[1] = next, etc.
    if not values:
        return 0.0
    num = 0.0
    den = 0.0
    for i, v in enumerate(values):
        w = decay ** i
        num += w * v
        den += w
    return num / den if den else 0.0


def score_translations(candidates: List[Dict[str, Any]], lang_code: str = None, weights: Dict[str, float] = None):
    # candidates: list of dict with at least: word, lang_code, translation_count, global_freq
    w = weights or {"trans_count": 0.4, "rarity": 0.25, "path": 0.2, "lang_boost": 0.15}
    _ensure_language_stats(lang_code)
    out = []
    for c in candidates:
        trans_count = c.get("translation_count", 0)
        freq = c.get("global_freq", 0)
        # rarity: smaller freq -> higher rarity
        rarity = 1.0 - (math.tanh(_log1p(freq) if freq else 0.0) / 1.0)
        path_score = c.get("path_score", 0.0)
        # normalize translation count to percentile within candidate language when stats available
        trans_norm = map_count_to_percentile(c.get("lang_code") or lang_code, trans_count, kind="translations")

        lang_boost = 0.0
        # small uplift for under-resourced languages (heuristic)
        if lang_code and lang_code not in ("en", "fr", "de", "es", "zh"):
            lang_boost = 0.12

        raw = w["trans_count"] * trans_norm + w["rarity"] * rarity + w["path"] * path_score + w["lang_boost"] * lang_boost
        score = max(0.0, min(1.0, raw))
        # contributions for explainability
        contribs = {
            "trans_count": round(w["trans_count"] * trans_norm, 4),
            "rarity": round(w["rarity"] * rarity, 4),
            "path": round(w["path"] * path_score, 4),
            "lang_boost": round(w["lang_boost"] * lang_boost, 4),
        }
        explanation = _explain_from_contribs(c, contribs)
        out.append({**c, "score": score, "features": contribs, "explanation": explanation})
    out.sort(key=lambda x: x.get("score", 0), reverse=True)
    return out


def score_roots(candidates: List[Dict[str, Any]], lang_code: str = None, weights: Dict[str, float] = None):
    w = weights or {"supporting": 0.35, "path": 0.35, "proto": 0.2, "rarity": 0.1}
    out = []
    for c in candidates:
        supporting = c.get("supporting_paths", 0)
        avg_path_score = c.get("avg_path_score", 0.0)
        proto = 1.0 if c.get("proto_score", 0) else 0.0
        rarity = 1.0 - (math.tanh(_log1p(c.get("global_freq", 0)) if c.get("global_freq") else 0.0) / 1.0)

        sup_norm = min(1.0, supporting / (1 + supporting))
        raw = w["supporting"] * sup_norm + w["path"] * avg_path_score + w["proto"] * proto + w["rarity"] * rarity
        score = max(0.0, min(1.0, raw))
        contribs = {
            "supporting": round(w["supporting"] * sup_norm, 4),
            "path": round(w["path"] * avg_path_score, 4),
            "proto": round(w["proto"] * proto, 4),
            "rarity": round(w["rarity"] * rarity, 4),
        }
        explanation = _explain_from_contribs(c, contribs)
        out.append({**c, "score": score, "features": contribs, "explanation": explanation})
    out.sort(key=lambda x: x.get("score", 0), reverse=True)
    return out


def score_descendants(candidates: List[Dict[str, Any]], lang_code: str = None, weights: Dict[str, float] = None):
    w = weights or {"desc_count": 0.35, "path": 0.35, "rarity": 0.2, "depth": 0.1}
    out = []
    for c in candidates:
        sub_count = c.get("subtree_descendant_count", 0)
        path_score = c.get("path_score", 0.0)
        depth = c.get("depth", 0)
        rarity = 1.0 - (math.tanh(_log1p(c.get("global_freq", 0)) if c.get("global_freq") else 0.0) / 1.0)

        count_norm = map_count_to_percentile(c.get("lang_code") or lang_code, sub_count, kind="descendants")
        depth_pen = 1.0 - min(1.0, depth / max(1, c.get("max_depth", 6)))

        raw = w["desc_count"] * count_norm + w["path"] * path_score + w["rarity"] * rarity + w["depth"] * depth_pen
        score = max(0.0, min(1.0, raw))
        contribs = {
            "desc_count": round(w["desc_count"] * count_norm, 4),
            "path": round(w["path"] * path_score, 4),
            "rarity": round(w["rarity"] * rarity, 4),
            "depth": round(w["depth"] * depth_pen, 4),
        }
        explanation = _explain_from_contribs(c, contribs)
        out.append({**c, "score": score, "features": contribs, "explanation": explanation})

    out.sort(key=lambda x: x.get("score", 0), reverse=True)
    return out


def _explain_from_contribs(cand: Dict[str, Any], contribs: Dict[str, float]) -> str:
    # Pick top 2 contributors for a short explanation
    items = sorted(contribs.items(), key=lambda kv: kv[1], reverse=True)
    parts = []
    for k, v in items[:2]:
        if v <= 0:
            continue
        if k == "trans_count":
            parts.append(f"high number of translations (+{int(v*100)}%)")
        elif k == "rarity":
            parts.append(f"rare globally (+{int(v*100)}%)")
        elif k == "path":
            parts.append(f"strong path interest (+{int(v*100)}%)")
        elif k == "lang_boost":
            parts.append("boosted for low-resource language")
        elif k == "supporting":
            parts.append(f"supported by {cand.get('supporting_paths', '?')} etymology paths")
        elif k == "proto":
            parts.append("proto-like root")
        elif k == "desc_count":
            parts.append(f"broad descendant subtree (+{int(v*100)}%)")
        elif k == "depth":
            parts.append("shallow depth preferred")
        else:
            parts.append(f"{k}: +{int(v*100)}%")

    if parts:
        return ", ".join(parts)
    return "Scored by combined signals."
