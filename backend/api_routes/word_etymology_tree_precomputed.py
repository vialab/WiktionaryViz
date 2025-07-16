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
    #print key:
    print(f"[DEBUG] get_timeline_tree: key='{key}', offset={offset}")
    if offset is None:
        return None
    with open(TIMELINE_TREES_FILE, "r", encoding="utf-8") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        mm.seek(offset)
        line = mm.readline().decode("utf-8").strip()
        mm.close()
        try:
            obj = json.loads(line)
            return obj  # Return the full object, not obj["tree"]
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

def build_etymology_tree_precomputed(node):
    """
    Recursively build the etymology tree by following linked_nodes in the precomputed timeline.
    If a linked node is missing, create a stub node with minimal info.
    """
    if not node or not node.get("data"):
        return node
    children = []
    for link in node["data"].get("linked_nodes", []):
        child_id = link["id"]
        child_key = child_id.rsplit("_", 1)[0]  # Remove trailing _id for lookup
        child_node = get_timeline_tree(child_key)
        if child_node:
            child_tree = build_etymology_tree_precomputed(child_node)
            children.append({
                "word": child_node["word"],
                "lang_code": child_node["lang_code"],
                "data": child_node["data"],
                "pronunciation": child_node.get("pronunciation"),
                "ai_estimated_ipa": child_node.get("ai_estimated_ipa"),
                "etymology_children": child_tree.get("etymology_children", [])
            })
        else:
            # Create a stub node for missing children
            children.append({
                "word": link.get("word", "unknown"),
                "lang_code": link.get("language", "unknown"),
                "data": {
                    "etymology": None,
                    "linked_nodes": []
                },
                "pronunciation": None,
                "ai_estimated_ipa": None,
                "etymology_children": []
            })
    node["etymology_children"] = children
    return node

def build_etymology_tree_full(word, lang_code, seen=None):
    """
    Recursively build the full etymology tree using etymology_templates, even if not precomputed.
    Fallback to precomputed node if available, otherwise use stubs and etymology_templates.
    """
    if seen is None:
        seen = set()
    key = f"{word.lower()}_{lang_code.lower()}"
    if key in seen:
        return None
    seen.add(key)
    node = get_timeline_tree(key)
    if node:
        # Use precomputed node, but try to expand children using etymology_templates if available
        children = []
        # Try to get etymology_templates from node['data']['etymology_templates'] if present, else fallback to linked_nodes
        etymology_templates = node.get('data', {}).get('etymology_templates', [])
        if etymology_templates:
            for tpl in etymology_templates:
                child_word = tpl['args'].get('3')
                child_lang = tpl['args'].get('2')
                if child_word and child_lang:
                    child_tree = build_etymology_tree_full(child_word, child_lang, seen.copy())
                    if child_tree:
                        children.append(child_tree)
                    else:
                        children.append({
                            "word": child_word,
                            "lang_code": child_lang,
                            "data": {"etymology": tpl.get("expansion", None), "linked_nodes": []},
                            "pronunciation": None,
                            "ai_estimated_ipa": None,
                            "etymology_children": []
                        })
        else:
            # Fallback to linked_nodes (precomputed)
            for link in node.get("data", {}).get("linked_nodes", []):
                child_id = link["id"]
                child_key = child_id.rsplit("_", 1)[0]
                child_tree = build_etymology_tree_full(*child_key.rsplit("_", 1), seen.copy())
                if child_tree:
                    children.append(child_tree)
                else:
                    children.append({
                        "word": link.get("word", "unknown"),
                        "lang_code": link.get("language", "unknown"),
                        "data": {"etymology": None, "linked_nodes": []},
                        "pronunciation": None,
                        "ai_estimated_ipa": None,
                        "etymology_children": []
                    })
        node["etymology_children"] = children
        return node
    else:
        # No precomputed node, try to build from etymology_templates if available (stub)
        # (This branch is rarely hit if precompute is complete)
        return {
            "word": word,
            "lang_code": lang_code,
            "data": {"etymology": None, "linked_nodes": []},
            "pronunciation": None,
            "ai_estimated_ipa": None,
            "etymology_children": []
        }

@router.get("/word-etymology-tree")
async def get_word_etymology_tree(word: str = Query(...), lang_code: str = Query(...)):
    tree = build_etymology_tree_full(word, lang_code)
    if not tree:
        return JSONResponse(content={"error": "No precomputed timeline tree found."}, status_code=404)
    # Supplement IPA with OpenAI if missing at root
    if (not tree.get("sounds") or not any(s.get("ipa") for s in tree.get("sounds", []))) and not tree.get("ai_estimated_ipa"):
        tree["ai_estimated_ipa"] = await get_ipa_with_openai(tree, word, lang_code)
    return JSONResponse(content=tree)
