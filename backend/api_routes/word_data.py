import os, json, random, mmap
import unicodedata
from fastapi import APIRouter, Query, Body
from fastapi.responses import JSONResponse
from constants import DATA_DIR, index, JSONL_FILE_PATH, lang_code_to_name
from dotenv import load_dotenv
import httpx

router = APIRouter()
from services.recommendation import score_translations, score_roots, score_descendants, decay_weighted_score


def _extract_gloss(entry: dict | None):
    if not entry:
        return ""

    for sense in entry.get("senses") or []:
        if isinstance(sense, dict):
            for gloss in sense.get("glosses") or []:
                if isinstance(gloss, str) and gloss.strip():
                    return gloss.strip()
            for gloss in sense.get("raw_glosses") or []:
                if isinstance(gloss, str) and gloss.strip():
                    return gloss.strip()

    if isinstance(entry.get("gloss"), str) and entry["gloss"].strip():
        return entry["gloss"].strip()

    return ""


def _resolve_lang_name(lang_code: str | None):
    if not lang_code:
        return "Unknown language"

    code = lang_code.strip()
    if code in lang_code_to_name:
        return lang_code_to_name[code]

    fallback_map = {
        "en": "English",
        "de": "German",
        "fr": "French",
        "es": "Spanish",
        "it": "Italian",
        "pt": "Portuguese",
        "ru": "Russian",
        "zh": "Chinese",
        "ja": "Japanese",
        "la": "Latin",
        "grc": "Ancient Greek",
        "fa": "Persian",
        "hi": "Hindi",
        "ar": "Arabic",
        "sa": "Sanskrit",
        "nl": "Dutch",
    }
    if code in fallback_map:
        return fallback_map[code]

    if os.path.exists(os.path.join(DATA_DIR, "language_codes.json")):
        try:
            with open(os.path.join(DATA_DIR, "language_codes.json"), "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict) and code in loaded and loaded[code]:
                return loaded[code]
        except Exception:
            pass

    return code


def build_random_interest_entry(category: str, entry: dict | None):
    raw_entry = entry or {}
    word = raw_entry.get("word") or "unknown"
    lang_code = (raw_entry.get("lang_code") or "").strip()
    lang_name = raw_entry.get("lang") or _resolve_lang_name(lang_code)
    gloss = _extract_gloss(raw_entry)
    reason = raw_entry.get("reason") or f"Highlighted in {category.replace('_', ' ')} category"

    return {
        "word": word,
        "lang_code": lang_code,
        "lang_name": lang_name,
        "gloss": gloss,
        "reason": reason,
        "category": category,
    }


def _normalize_for_match(text: str):
    if not text:
        return None
    return str(text).strip().lower()


def _index_word_variants(text: str):
    raw = _normalize_for_match(text)
    if not raw:
        return []

    variants = [raw]

    stripped = raw.lstrip("*")
    if stripped and stripped not in variants:
        variants.append(stripped)

    deaccented = "".join(ch for ch in unicodedata.normalize("NFKD", stripped) if unicodedata.category(ch) != "Mn")
    if deaccented and deaccented not in variants:
        variants.append(deaccented)

    if stripped.startswith("reconstruction:"):
        bare = stripped[len("reconstruction:"):].strip()
        if bare and bare not in variants:
            variants.append(bare)

    return variants


def _candidate_word_keys(word: str, lang_code: str):
    """Return possible index keys for a word, preferring exact matches first.

    Wiktionary entries sometimes use alias/variety codes such as `fa-cls`
    while the stored entry lives under the canonical code `fa`. We keep the
    exact lookup first, then fall back to progressively shorter hyphenated
    prefixes so descendant markers can still resolve to a real entry.
    """
    normalized_lang = lang_code.strip().lower()

    candidates = []
    for normalized_word in _index_word_variants(word):
        exact = f"{normalized_word}_{normalized_lang}"
        if exact in index and exact not in candidates:
            candidates.append(exact)

        if "-" in normalized_lang:
            parts = normalized_lang.split("-")
            for end in range(len(parts) - 1, 0, -1):
                prefix = "-".join(parts[:end])
                candidate = f"{normalized_word}_{prefix}"
                if candidate not in candidates:
                    candidates.append(candidate)

        for key in index:
            if key.startswith(f"{normalized_word}_") and key not in candidates:
                candidates.append(key)

    return candidates

@router.get("/word-data")
async def get_word_data(word: str = Query(...), lang_code: str = Query(...)):
    key = next((candidate for candidate in _candidate_word_keys(word, lang_code) if candidate in index), None)
    if key is None:
        return JSONResponse(content={"message": "No matching entries found."}, status_code=404)

    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(index[key])  # Use the integer offset directly
            line = mm.readline().decode("utf-8").strip()
            # print(f"[DEBUG] Raw line for word='{word}', lang_code='{lang_code}': {line}")
            mm.close()
            data = json.loads(line)
            return JSONResponse(content=data)
    except Exception as e:
        print(f"[ERROR] get_word_data failed for word='{word}', lang_code='{lang_code}': {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)



@router.get("/inspire-me")
async def inspire_me(word: str = Query(...), lang_code: str = Query(None)):
    """Generate three recommendation JSON blobs: translations, etymology roots, descendants.

    This endpoint uses deterministic, no-training scoring to avoid bias towards high-resource
    languages by applying simple normalizations and a small low-resource boost.
    """
    # Minimal candidate collection logic: reuse existing data files when available.
    translations_candidates = []
    roots_candidates = []
    descendants_candidates = []

    # Extract translations from the entry's senses (defensive parsing).
    try:
        candidate_key = next((candidate for candidate in _candidate_word_keys(word, lang_code) if candidate in index), None)
        if candidate_key:
            with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
                mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
                off = index[candidate_key]
                try:
                    off_int = off[0] if isinstance(off, (list, tuple)) else int(off)
                except Exception:
                    off_int = int(off)
                mm.seek(off_int)
                try:
                    entry = json.loads(mm.readline().decode("utf-8"))
                except Exception:
                    entry = None
                mm.close()

            def _collect_translations_from_obj(obj):
                out = []
                if isinstance(obj, dict):
                    # common patterns: top-level 'translations' or senses -> translations
                    if "translations" in obj and isinstance(obj["translations"], list):
                        for t in obj["translations"]:
                            if isinstance(t, dict):
                                lang = t.get("lang") or t.get("lang_code") or t.get("language")
                                text = t.get("translation") or t.get("text") or t.get("word") or t.get("label")
                                if not text and "translations" in t and isinstance(t["translations"], list):
                                    # nested list
                                    for tt in t["translations"]:
                                        if isinstance(tt, dict):
                                            ttext = tt.get("translation") or tt.get("text") or tt.get("word")
                                            if ttext:
                                                out.append({"word": ttext, "lang_code": lang or tt.get("lang")})
                                elif text:
                                    out.append({"word": text, "lang_code": lang})
                    # recurse into dict values
                    for v in obj.values():
                        out.extend(_collect_translations_from_obj(v))
                elif isinstance(obj, list):
                    for it in obj:
                        out.extend(_collect_translations_from_obj(it))
                return out

            if entry:
                raw_trans = _collect_translations_from_obj(entry)
                seen = set()
                for t in raw_trans:
                    w = (t.get("word") or "").strip()
                    lc = (t.get("lang_code") or t.get("lang") or "").strip().lower()
                    if not w:
                        continue
                    key = f"{w}_{lc}"
                    if key in seen:
                        continue
                    seen.add(key)
                    translations_candidates.append({
                        "word": w,
                        "lang_code": lc or None,
                        "translation_count": 0,
                        "global_freq": 0,
                        "path_score": 0.0,
                    })
    except Exception:
        translations_candidates = []

    # Etymology roots: reuse ancestor_roots endpoint logic by invoking helper functions
    try:
        # Best-effort lightweight root candidate inference: open JSONL and call existing resolver
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            # attempt to find candidate index key
            candidate_key = None
            if lang_code:
                key = f"{word.lower()}_{lang_code.lower()}"
                if key in index:
                    candidate_key = key
            if not candidate_key:
                # fallback: pick first matching index key
                for k in index:
                    if k.startswith(f"{word.lower()}_"):
                        candidate_key = k
                        break
            # simple parse: if found, read entry and look for etymology_templates
            if candidate_key:
                mm.seek(index[candidate_key])
                entry = json.loads(mm.readline().decode("utf-8"))
                templates = entry.get("etymology_templates", []) or []
                # collect direct ancestor args
                for tpl in templates:
                    if not tpl or not isinstance(tpl, dict):
                        continue
                    args = tpl.get("args") or {}
                    pword = args.get("3")
                    plong = args.get("2")
                    if pword:
                        roots_candidates.append({
                            "word": pword,
                            "lang_code": plong,
                            "supporting_paths": 1,
                            "avg_path_score": 0.6,
                            "proto_score": 1 if (isinstance(pword, str) and pword.startswith("*")) else 0,
                            "global_freq": 0,
                        })
            mm.close()
    except Exception:
        roots_candidates = []

    # Descendants: gather immediate descendant candidates and estimate small subtree sizes.
    try:
        from api_routes.descendants import _immediate_descendants_for_node

        immediate = _immediate_descendants_for_node(word, lang_code, max_children=24, root_key=None)
        for child in immediate:
            child_word = child.get("word")
            child_lang = child.get("lang_code")
            # Get immediate grandchildren count as a cheap subtree size estimate
            try:
                grandchildren = _immediate_descendants_for_node(child_word, child_lang, max_children=60, root_key=None)
                subtree_count = len(grandchildren)
            except Exception:
                subtree_count = 0
            descendants_candidates.append({
                "word": child_word,
                "lang_code": child_lang,
                "node_key": child.get("key"),
                "subtree_descendant_count": subtree_count,
                "path_score": 0.0,
                "depth": 1,
                "max_depth": 6,
                "global_freq": 0,
            })
    except Exception:
        descendants_candidates = []

    # Compute path_score for descendant candidates using full descendant tree paths (may be heavier).
    try:
        from services.recommendation import compute_candidate_path_scores
        # Determine best root_word for descendant tree: prefer provided word
        root_word = word
        root_lang = lang_code
        path_scores = compute_candidate_path_scores(root_word, root_lang, descendants_candidates, max_depth=6, decay=0.85)
        for c in descendants_candidates:
            k = f"{(c.get('word') or '').strip().lower()}_{(c.get('lang_code') or '').strip().lower()}".rstrip("_")
            c["path_score"] = path_scores.get(k, c.get("path_score", 0.0))
    except Exception:
        pass

    scored_trans = score_translations(translations_candidates, lang_code=lang_code)
    scored_roots = score_roots(roots_candidates, lang_code=lang_code)
    scored_descs = score_descendants(descendants_candidates, lang_code=lang_code)

    payload = {
        "query": {"word": word, "lang_code": lang_code},
        "translations": scored_trans,
        "etymology_roots": scored_roots,
        "descendants": scored_descs,
    }
    return JSONResponse(content=payload)

@router.get("/available-languages")
async def get_available_languages(word: str = Query(...), codes_only: bool = Query(False)):
    """Return available languages for a word.

    Params:
      word: target lemma
      codes_only: backwards compatibility flag; if true returns just list[str]
    """
    word = word.lower()
    codes = [key.split("_", 1)[1] for key in index if key.startswith(f"{word}_")]
    if not codes:
        return JSONResponse(content={"message": "No languages found."}, status_code=404)
    unique_codes = sorted(set(codes))
    if codes_only:
        return JSONResponse(content={"languages": unique_codes})
    enriched = [
        {"code": c, "name": lang_code_to_name.get(c, c)} for c in unique_codes
    ]
    return JSONResponse(content={"languages": enriched})

@router.get("/random-interesting-word")
async def get_random_interest():
    categories = {
        "most_translations": os.path.join(DATA_DIR, "most_translations.json"),
        "most_descendants": os.path.join(DATA_DIR, "most_descendants.json"),
    }
    cat = random.choice(list(categories.keys()))
    file_path = categories[cat]

    if not os.path.exists(file_path):
        return JSONResponse(content={"error": f"No file for category '{cat}'."}, status_code=500)

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not data:
        return JSONResponse(content={"error": f"No entries found in {file_path}."}, status_code=404)

    candidate = random.choice(data)
    word = candidate.get("word")
    lang_code = candidate.get("lang_code")

    entry = None
    if word and lang_code:
        key = next((candidate_key for candidate_key in _candidate_word_keys(word, lang_code) if candidate_key in index), None)
        if key is not None:
            try:
                with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
                    mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
                    mm.seek(index[key])
                    line = mm.readline().decode("utf-8").strip()
                    mm.close()
                    entry = json.loads(line)
            except Exception:
                entry = None

    return build_random_interest_entry(cat, entry or candidate)