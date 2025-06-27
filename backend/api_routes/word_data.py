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
            mm.seek(index[key][0])
            line = mm.readline().decode("utf-8").strip()
            mm.close()
            return JSONResponse(content=json.loads(line))
    except Exception as e:
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
            mm.seek(index[key][0])
            line = mm.readline().decode("utf-8").strip()
            mm.close()
            data = json.loads(line)
            # If IPA missing, try to supplement
            if not data.get("sounds") or not any(s.get("ipa") for s in data.get("sounds", [])):
                data["ai_estimated_ipa"] = await ai_estimate_ipa(word, lang_code)
            return data
    # Not found, supplement with AI
    return {
        "word": word,
        "lang_code": lang_code,
        "ai_estimated": True,
        "ai_estimated_ipa": await ai_estimate_ipa(word, lang_code)
    }

# Helper: AI estimation for IPA using latest OpenAI async API
async def ai_estimate_ipa(word, lang_code):
    load_dotenv()
    client = AsyncOpenAI()
    prompt = f"Provide the IPA transcription for the word '{word}' in language code '{lang_code}'. If unknown, make your best guess. Only return the IPA."
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

# Recursive tree builder
async def build_etymology_tree(word, lang_code, depth=0, max_depth=10):
    if depth > max_depth:
        return None
    node = await get_word_data_or_ai(word, lang_code)
    children = []
    # Find etymology_templates for further recursion
    for tpl in node.get("etymology_templates", []):
        child_word = tpl["args"].get("3")
        child_lang = tpl["args"].get("2")
        if child_word and child_lang:
            child_node = await build_etymology_tree(child_word, child_lang, depth+1, max_depth)
            # Add phonetic drift if IPA available
            ipa1 = None
            ipa2 = None
            if node.get("sounds"):
                for s in node["sounds"]:
                    if s.get("ipa"): ipa1 = s["ipa"]
            if child_node and child_node.get("sounds"):
                for s in child_node["sounds"]:
                    if s.get("ipa"): ipa2 = s["ipa"]
            if not ipa1: ipa1 = node.get("ai_estimated_ipa")
            if child_node and not ipa2: ipa2 = child_node.get("ai_estimated_ipa")
            drift = await get_phonetic_drift(ipa1, ipa2) if ipa1 and ipa2 else None
            children.append({
                "word": child_word,
                "lang_code": child_lang,
                "data": child_node,
                "phonetic_drift": drift
            })
    node["etymology_children"] = children
    return node

# Remove or comment out the old recursive /word-etymology-tree endpoint
#@router.get("/word-etymology-tree")
#async def get_word_etymology_tree(word: str = Query(...), lang_code: str = Query(...)):
#    tree = await build_etymology_tree(word, lang_code)
#    return JSONResponse(content=tree)
