import os, json, random, mmap
from fastapi import APIRouter, Query, Body
from fastapi.responses import JSONResponse
from constants import DATA_DIR, index, JSONL_FILE_PATH, lang_code_to_name
from dotenv import load_dotenv
from openai import AsyncOpenAI
import httpx

router = APIRouter()

@router.get("/word-data")
async def get_word_data(word: str = Query(...), lang_code: str = Query(...)):
    key = f"{word.lower()}_{lang_code.lower()}"
    if key not in index:
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
        "longest_words": os.path.join(DATA_DIR, "longest_words.json"),
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

    return {"category": cat, "entry": random.choice(data)}

# TODO [HIGH LEVEL]: Add POST /ai/suggest-filters to propose filters and patterns for exploration.
# TODO [LOW LEVEL]: Accept seed word/lang and return filters with rationale and example matches.

# TODO [HIGH LEVEL]: Add GET /kwic to return KWIC examples for a word/lang in a time window.
# TODO [LOW LEVEL]: Query prebuilt examples or compute from corpora; support pagination and highlighting.

# Helper: Get word-data or supplement with AI if missing
async def get_word_data_or_ai(word, lang_code):
    key = f"{word.lower()}_{lang_code.lower()}"
    if key in index:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(index[key])
            line = mm.readline().decode("utf-8").strip()
            mm.close()
            data = json.loads(line)
            # # If IPA missing, try to supplement
            # if not data.get("sounds") or not any(s.get("ipa") for s in data.get("sounds", [])):
            #     data["ai_estimated_ipa"] = await ai_estimate_ipa(word, lang_code)
            return data
    # Not found, supplement with AI
    return {
        "word": word,
        "lang_code": lang_code,
        # "ai_estimated": True,
        # "ai_estimated_ipa": await ai_estimate_ipa(word, lang_code)
    }

# Helper: AI estimation for IPA using latest OpenAI async API
async def ai_estimate_ipa(word, lang_code, expansion=None):
    load_dotenv()
    client = AsyncOpenAI()

    if expansion:
        prompt = (
            f"Estimate the IPA pronunciation of the historical word in this etymological context: {expansion}. "
            "Respond only with the phonetic IPA transcription in square brackets, without additional explanation or text. "
            "If the pronunciation is unknown, make your best linguistic guess based on phonological reasoning and related forms."
        )
    else:
        prompt = (
            f"Estimate the IPA pronunciation of the historical word '{word}' in the language '{lang_code}'. "
            "Respond only with the IPA transcription in square brackets, without additional explanation or text. "
            "If the pronunciation is unknown, make your best linguistic guess based on phonological reasoning and related forms."
        )

    # print(f"[DEBUG] AI estimation prompt: {prompt}")

    try:
        completion = await client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {
                    "role": "system",
                    "content": "You are a historical linguist and expert in phonological reconstruction and IPA transcription. You estimate historical pronunciations using comparative linguistics, etymology, and knowledge of sound changes. Only respond with the most plausible IPA transcription in square brackets. No extra text."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=20
        )
        result = completion.choices[0].message.content.strip()
        # TODO [LOW LEVEL]: Normalize brackets to phonemic/phonetic form and validate with ft parser.
        return result
    except Exception as e:
        return None

# Helper: Get phonetic drift (call existing endpoint internally)
async def get_phonetic_drift(ipa1, ipa2):
    url = "http://localhost:8000/phonetic-drift-detailed"
    params = {"ipa1": ipa1, "ipa2": ipa2}
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, params=params)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
    return None


# Flat ancestry chain builder for timeline
async def build_ancestry_chain(word, lang_code, max_depth=10):
    chain = []
    # Get root node
    node = await get_word_data_or_ai(word, lang_code)
    ipa = None
    phonemic_ipa = None
    # print(f"[DEBUG] build_ancestry_chain: word={word}, lang_code={lang_code}, node.sounds={node.get('sounds')}")
    # Prefer real IPA and phonemic IPA from sounds
    if node.get("sounds"):
        for s in node["sounds"]:
            if s.get("ipa"):
                ipa_candidate = s["ipa"]
                # print(f"[DEBUG] IPA candidate for root: {ipa_candidate}")
                if ipa_candidate.startswith("/") and ipa_candidate.endswith("/"):
                    phonemic_ipa = ipa_candidate
                elif not ipa:
                    ipa = ipa_candidate
    # Only estimate IPA if no real IPA found
    if not ipa:
        expansion = node.get("expansion")
        # print(f"[DEBUG] No real IPA for root, estimating with AI for word={word}, lang_code={lang_code}, expansion={expansion}")
        ipa = await ai_estimate_ipa(word, lang_code, expansion)
        node["ai_estimated_ipa"] = ipa
    else:
        # print(f"[DEBUG] Real IPA found for root: {ipa}")
        # Remove ai_estimated_ipa if real IPA exists
        node.pop("ai_estimated_ipa", None)
    from constants import dst, ft
    # (Removed duplicate root node logic that overwrote real IPA)
    chain.append({
        "word": word,
        "lang_code": lang_code,
        "ipa": ipa,
        "phonemic_ipa": phonemic_ipa,
        "node": node,
        "drift": 0  # root node has no drift
    })
    # Walk through all etymology_templates in order
    templates = node.get("etymology_templates", [])
    prev_ipa = ipa
    for tpl in templates:
        lang = tpl["args"].get("2")
        w = tpl["args"].get("3")
        # print(f"[DEBUG] Template: lang={lang}, word={w}")
        if lang and w:
            # Get ancestor node
            ancestor = await get_word_data_or_ai(w, lang)
            # print(f"[DEBUG] Ancestor node for word={w}, lang={lang}: sounds={ancestor.get('sounds')}")
            ancestor_ipa = None
            ancestor_phonemic_ipa = None
            # Prefer real IPA and phonemic IPA from sounds
            if ancestor.get("sounds"):
                for s in ancestor["sounds"]:
                    if s.get("ipa"):
                        ipa_candidate = s["ipa"]
                        # print(f"[DEBUG] IPA candidate for ancestor {w}: {ipa_candidate}")
                        if ipa_candidate.startswith("/") and ipa_candidate.endswith("/"):
                            ancestor_phonemic_ipa = ipa_candidate
                        elif not ancestor_ipa:
                            ancestor_ipa = ipa_candidate
            # Only estimate IPA if no real IPA found
            if not ancestor_ipa:
                expansion = ancestor.get("expansion")
                # print(f"[DEBUG] No real IPA for ancestor {w}, estimating with AI, expansion={expansion}")
                ancestor_ipa = await ai_estimate_ipa(w, lang, expansion)
                ancestor["ai_estimated_ipa"] = ancestor_ipa
            else:
                # print(f"[DEBUG] Real IPA found for ancestor {w}: {ancestor_ipa}")
                # Remove ai_estimated_ipa if real IPA exists
                ancestor.pop("ai_estimated_ipa", None)
            # Compute drift score
            drift_score = 0
            if prev_ipa and ancestor_ipa:
                try:
                    drift_score = dst.feature_edit_distance(str(prev_ipa), str(ancestor_ipa))
                except Exception as e:
                    # print(f"[DEBUG] Drift score computation failed for {w}: {e}")
                    drift_score = 0
            # print(f"[DEBUG] Chain append: word={w}, lang={lang}, ipa={ancestor_ipa}, phonemic_ipa={ancestor_phonemic_ipa}, drift={drift_score}")
            chain.append({
                "word": w,
                "lang_code": lang,
                "ipa": ancestor_ipa,
                "phonemic_ipa": ancestor_phonemic_ipa,
                "node": ancestor,
                "drift": drift_score
            })
            prev_ipa = ancestor_ipa
    return chain