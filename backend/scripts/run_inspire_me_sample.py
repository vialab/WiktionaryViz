import json
import mmap
from services import recommendation
from services.wiktionary_io import build_descendant_hierarchy
from constants import JSONL_FILE_PATH, index, REVERSE_DESCENDANT_GRAPH_FILE_PATH
import unicodedata
import os


def collect_translations_for_word(word, lang_code):
    candidates = []
    # find candidate key
    key = None
    if lang_code:
        cand = f"{word.lower()}_{lang_code.lower()}"
        if cand in index:
            key = cand
    if not key:
        for k in index:
            if k.startswith(f"{word.lower()}_"):
                key = k
                break

    if key:
        off = index[key]
        off_int = off[0] if isinstance(off, (list, tuple)) else int(off)
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(off_int)
            try:
                entry = json.loads(mm.readline().decode("utf-8"))
            except Exception:
                entry = None
            mm.close()

        def _collect(obj):
            out = []
            if isinstance(obj, dict):
                if "translations" in obj and isinstance(obj["translations"], list):
                    for t in obj["translations"]:
                        if isinstance(t, dict):
                            text = t.get("translation") or t.get("text") or t.get("word")
                            lang = t.get("lang") or t.get("lang_code")
                            if text:
                                out.append({"word": text, "lang_code": (lang or '').lower()})
                for v in obj.values():
                    out.extend(_collect(v))
            elif isinstance(obj, list):
                for it in obj:
                    out.extend(_collect(it))
            return out

        if entry:
            raw = _collect(entry)
            seen = set()
            for t in raw:
                w = (t.get("word") or "").strip()
                lc = (t.get("lang_code") or "").strip().lower()
                if not w:
                    continue
                key2 = f"{w}_{lc}"
                if key2 in seen:
                    continue
                seen.add(key2)
                candidates.append({"word": w, "lang_code": lc or None, "translation_count": 0, "global_freq": 0, "path_score": 0.0})

            # enrich candidate signals: translation_count and global_freq
            for c in candidates:
                # translation_count: try to read entry for candidate and count translations
                try:
                    from services.recommendation import _read_entry
                    ent = _read_entry(c.get("word"), c.get("lang_code"))
                    tcount = 0
                    if ent:
                        if ent.get("translations") and isinstance(ent.get("translations"), list):
                            tcount = len(ent.get("translations") or [])
                        else:
                            senses = ent.get("senses") or []
                            for s in senses:
                                if isinstance(s, dict) and s.get("translations") and isinstance(s.get("translations"), list):
                                    tcount += len(s.get("translations"))
                    c["translation_count"] = tcount
                except Exception:
                    c["translation_count"] = c.get("translation_count", 0)

                # global_freq: cheap proxy = number of index keys for this lemma across languages
                try:
                    keyprefix = (c.get("word") or "").strip().lower()
                    c["global_freq"] = sum(1 for k in index if k.startswith(f"{keyprefix}_"))
                except Exception:
                    c["global_freq"] = c.get("global_freq", 0)

    return candidates


def collect_descendants_for_word(word, lang_code):
    candidates = []
    # Prefer reverse graph lookup (faster and available when entry lacks explicit descendants)
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

    try:
        if os.path.exists(REVERSE_DESCENDANT_GRAPH_FILE_PATH):
            with open(REVERSE_DESCENDANT_GRAPH_FILE_PATH, "r", encoding="utf-8") as gf:
                graph = json.load(gf)
            keys = graph_key_variants(word, lang_code)
            seen = set()
            for k in keys:
                for child_key in sorted(graph.get(k, []) ):
                    if len(candidates) >= 200:
                        break
                    if child_key in seen:
                        continue
                    seen.add(child_key)
                    if "_" in child_key:
                        child_word, child_lang = child_key.rsplit("_", 1)
                    else:
                        child_word, child_lang = child_key, None
                    # subtree estimate: try counting children in graph for this child
                    subtree = 0
                    try:
                        subtree = len(graph.get(child_key, []))
                    except Exception:
                        subtree = 0
                    candidates.append({
                        "word": child_word,
                        "lang_code": child_lang,
                        "node_key": child_key,
                        "subtree_descendant_count": subtree,
                        "path_score": 0.0,
                        "depth": 1,
                        "max_depth": 6,
                        "global_freq": 0,
                    })
                if len(candidates) >= 200:
                    break
    except Exception:
        pass

    return candidates


def run_sample(word, lang_code="en"):
    trans = collect_translations_for_word(word, lang_code)
    roots = []
    descs = collect_descendants_for_word(word, lang_code)

    # compute path scores for descendants
    try:
        path_scores = recommendation.compute_candidate_path_scores(word, lang_code, descs, max_depth=6)
        for c in descs:
            k = f"{(c.get('word') or '').strip().lower()}_{(c.get('lang_code') or '').strip().lower()}".rstrip("_")
            c["path_score"] = path_scores.get(k) or 0.0
    except Exception:
        pass

    scored_trans = recommendation.score_translations(trans, lang_code=lang_code)
    scored_roots = recommendation.score_roots(roots, lang_code=lang_code)
    scored_descs = recommendation.score_descendants(descs, lang_code=lang_code)

    out = {"query": {"word": word, "lang_code": lang_code}, "translations": scored_trans, "etymology_roots": scored_roots, "descendants": scored_descs}
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run_sample("water", "en")
