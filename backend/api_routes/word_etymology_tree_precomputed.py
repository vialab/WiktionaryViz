import os
import json
import mmap
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import DATA_DIR
from dotenv import load_dotenv
from openai import AsyncOpenAI

router = APIRouter()

TIMELINE_TREES_FILE = os.path.join(DATA_DIR, "timeline_trees.jsonl")
TIMELINE_TREES_INDEX_FILE = os.path.join(DATA_DIR, "timeline_trees_index.json")

# Helper: load timeline trees index {key: byte_offset}
def load_timeline_trees_index():
    if not os.path.exists(TIMELINE_TREES_INDEX_FILE):
        return {}
    with open(TIMELINE_TREES_INDEX_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

timeline_trees_index = load_timeline_trees_index()

# Helper: get timeline tree from JSONL using index
def get_timeline_tree(key):
    offset = timeline_trees_index.get(key)
    if offset is None:
        return None
    with open(TIMELINE_TREES_FILE, "r", encoding="utf-8") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        mm.seek(offset)
        line = mm.readline().decode("utf-8").strip()
        mm.close()
        try:
            obj = json.loads(line)
            return obj["tree"]
        except Exception:
            return None

# Helper: supplement IPA using OpenAI if missing
async def get_ipa_with_openai(node, word, lang_code):
    ipa = None
    if node.get("sounds"):
        for s in node["sounds"]:
            if s.get("ipa"):
                ipa = s["ipa"]
    if not ipa:
        # Use OpenAI to estimate IPA
        try:
            load_dotenv()
            client = AsyncOpenAI()
            prompt = f"Provide the IPA transcription for the word '{word}' in language code '{lang_code}'. If unknown, make your best guess. Only return the IPA."
            completion = await client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a linguist and expert in phonetic transcription."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=20
            )
            ipa = completion.choices[0].message.content.strip()
        except Exception:
            pass
    return ipa

@router.get("/word-etymology-tree")
async def get_word_etymology_tree(word: str = Query(...), lang_code: str = Query(...)):
    key = f"{word.lower()}_{lang_code.lower()}"
    tree = get_timeline_tree(key)
    if not tree:
        return JSONResponse(content={"error": "No precomputed timeline tree found."}, status_code=404)
    # Supplement IPA with OpenAI if missing at root
    if (not tree.get("sounds") or not any(s.get("ipa") for s in tree.get("sounds", []))) and not tree.get("ai_estimated_ipa"):
        tree["ai_estimated_ipa"] = await get_ipa_with_openai(tree, word, lang_code)
    return JSONResponse(content=tree)
