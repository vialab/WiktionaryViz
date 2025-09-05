import json
from tqdm import tqdm
from collections import OrderedDict
import os
from constants import DATA_DIR, INDEX_FILE_PATH, JSONL_FILE_PATH, LANG_MAP_FILE_PATH

"""Build a mapping of lang_code -> language name from wiktionary_data.jsonl.

Strategy:
 1. Load index to collect all lang codes needed.
 2. Stream JSONL file; for each line grab first occurrence of each lang_code's human name.
 3. Early-stop once all codes resolved.
 4. Save deterministic sorted mapping to language_codes.json.

Run:
  python build_language_codes.py
"""

def load_index_keys():
    try:
        with open(INDEX_FILE_PATH, 'r', encoding='utf-8') as f:
            idx = json.load(f)
        codes = {k.rsplit('_', 1)[1] for k in idx.keys() if '_' in k}
        return codes
    except FileNotFoundError:
        print(f"Index file not found: {INDEX_FILE_PATH}. Build index first.")
        return set()


def build_language_codes():
    needed = load_index_keys()
    if not needed:
        print("No language codes derived from index; aborting.")
        return

    if os.path.exists(LANG_MAP_FILE_PATH):
        try:
            with open(LANG_MAP_FILE_PATH, 'r', encoding='utf-8') as f:
                existing = json.load(f)
        except Exception:
            existing = {}
    else:
        existing = {}

    missing = needed - set(existing.keys())
    if not missing:
        print(f"language_codes.json already has all {len(needed)} codes. Nothing to do.")
        return

    print(f"Building language code map: {len(missing)} missing of {len(needed)} total codes.")
    found = 0

    try:
        with open(JSONL_FILE_PATH, 'r', encoding='utf-8') as f:
            for line in tqdm(f, desc='Scanning JSONL for language names'):
                if not missing:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                code = entry.get('lang_code')
                name = entry.get('lang')
                if code and name and code in missing:
                    existing[code] = name
                    missing.remove(code)
                    found += 1
    except FileNotFoundError:
        print(f"JSONL data file not found: {JSONL_FILE_PATH}")
        return

    # Sort by code for deterministic output
    ordered = OrderedDict(sorted(existing.items(), key=lambda kv: kv[0]))
    with open(LANG_MAP_FILE_PATH, 'w', encoding='utf-8') as out:
        json.dump(ordered, out, ensure_ascii=False, indent=2)

    print(f"Saved {len(ordered)} language codes to {LANG_MAP_FILE_PATH}. Newly collected: {found}.")
    if missing:
        print(f"⚠️ Warning: {len(missing)} codes were not resolved (no entries with names found). They will be absent.")

if __name__ == '__main__':
    build_language_codes()
