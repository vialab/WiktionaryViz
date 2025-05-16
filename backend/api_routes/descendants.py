import mmap, json
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import index, JSONL_FILE_PATH
from services.wiktionary_io import find_root_ancestor, build_descendant_hierarchy

router = APIRouter()

@router.get("/descendant-tree")
async def get_descendant_tree(word: str, lang_code: str):
    key = f"{word.lower()}_{lang_code.lower()}"
    if key not in index:
        return JSONResponse(content={"error": "Word not found."}, status_code=404)
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            mm.seek(index[key][0])
            entry = json.loads(mm.readline().decode("utf-8"))
            root = find_root_ancestor(entry, mm)
            tree = build_descendant_hierarchy(root, mm)
            mm.close()
            return tree
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@router.get("/descendant-tree-from-root")
async def descendant_tree_from_root(word: str, lang_code: str):
    try:
        with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            tree = build_descendant_hierarchy(word, mm, lang_code=lang_code)
            mm.close()
            return tree
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
