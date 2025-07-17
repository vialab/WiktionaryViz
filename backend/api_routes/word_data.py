import os, json, random, mmap
from fastapi import APIRouter, Query, Body
from fastapi.responses import JSONResponse
from constants import DATA_DIR, index, JSONL_FILE_PATH
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
            print(f"[DEBUG] Raw line for word='{word}', lang_code='{lang_code}': {line}")
            mm.close()
            data = json.loads(line)
            return JSONResponse(content=data)
    except Exception as e:
        print(f"[ERROR] get_word_data failed for word='{word}', lang_code='{lang_code}': {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@router.get("/available-languages")
async def get_available_languages(word: str = Query(...)):
    word = word.lower()
    langs = [key.split("_", 1)[1] for key in index if key.startswith(f"{word}_")]
    if not langs:
        return JSONResponse(content={"message": "No languages found."}, status_code=404)
    return JSONResponse(content={"languages": sorted(set(langs))})

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
    context = f"word '{word}' in language code '{lang_code}'"
    if expansion:
        context += f" (etymological context: {expansion})"
    prompt = f"Provide the phonetic IPA transcription for {context}. If unknown, make your best guess. Only return the IPA in square brackets."
    try:
        completion = await client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {"role": "system", "content": "You are a linguist and expert in phonetic transcription."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=20
        )
        return completion.choices[0].message.content.strip()
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
    # Find real IPA if present
    if node.get("sounds"):
        for s in node["sounds"]:
            if s.get("ipa"):
                ipa_candidate = s["ipa"]
                if ipa_candidate.startswith("/") and ipa_candidate.endswith("/"):
                    phonemic_ipa = ipa_candidate
                elif not ipa:
                    ipa = ipa_candidate
    # Only estimate IPA if no real IPA found
    if not ipa:
        expansion = node.get("expansion")
        ipa = await ai_estimate_ipa(word, lang_code, expansion)
        node["ai_estimated_ipa"] = ipa
    from constants import dst, ft
    chain = []
    # Get root node
    node = await get_word_data_or_ai(word, lang_code)
    ipa = None
    phonemic_ipa = None
    if node.get("sounds"):
        for s in node["sounds"]:
            pass  # ...existing code...
    if not ipa:
        # If only phonemic IPA, estimate phonetic IPA
        expansion = node.get("expansion")
        ipa = await ai_estimate_ipa(word, lang_code, expansion)
        node["ai_estimated_ipa"] = ipa
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
        if lang and w:
            # Get ancestor node
            ancestor = await get_word_data_or_ai(w, lang)
            ancestor_ipa = None
            ancestor_phonemic_ipa = None
            # Find real IPA if present
            if ancestor.get("sounds"):
                for s in ancestor["sounds"]:
                    if s.get("ipa"):
                        ipa_candidate = s["ipa"]
                        if ipa_candidate.startswith("/") and ipa_candidate.endswith("/"):
                            ancestor_phonemic_ipa = ipa_candidate
                        elif not ancestor_ipa:
                            ancestor_ipa = ipa_candidate
                # Only estimate IPA if no real IPA found
            if not ancestor_ipa:
                expansion = ancestor.get("expansion")
                ancestor_ipa = await ai_estimate_ipa(w, lang, expansion)
                ancestor["ai_estimated_ipa"] = ancestor_ipa
            # Compute drift score
            drift_score = 0
            if prev_ipa and ancestor_ipa:
                try:
                    drift_score = dst.feature_edit_distance(str(prev_ipa), str(ancestor_ipa))
                except Exception:
                    drift_score = 0
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