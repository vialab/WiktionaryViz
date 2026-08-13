import json
import mmap
import os
from collections import defaultdict
from statistics import median
from constants import JSONL_FILE_PATH, INDEX_FILE_PATH, DATA_DIR, index


def _percentiles_from_sorted(arr, probs=(0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1.0)):
    if not arr:
        return {str(int(p*100)): 0.0 for p in probs}
    out = {}
    n = len(arr)
    for p in probs:
        if p <= 0:
            val = arr[0]
        elif p >= 1:
            val = arr[-1]
        else:
            idx = int(p * (n - 1))
            val = arr[idx]
        out[str(int(p*100))] = val
    return out


def build_language_stats(output_path=None):
    output_path = output_path or os.path.join(DATA_DIR, "language_stats.json")
    lang_trans = defaultdict(list)
    lang_desc = defaultdict(list)

    # Ensure index is populated (build_index.py should have run)
    if not index:
        # try to load index file
        try:
            with open(INDEX_FILE_PATH, "r", encoding="utf-8") as f:
                idx = json.load(f)
                index.update(idx)
        except Exception:
            print("Index missing; run build_index.py first")
            return

    total = len(index)
    print(f"Scanning {total} index entries to build language stats (this may take a while)...")

    with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        seen = 0
        for key, off in index.items():
            try:
                off_int = off[0] if isinstance(off, (list, tuple)) else int(off)
            except Exception:
                continue
            try:
                mm.seek(off_int)
                entry = json.loads(mm.readline().decode("utf-8"))
            except Exception:
                continue

            # language code is suffix after last '_' in key
            lang = None
            if isinstance(key, str) and "_" in key:
                lang = key.rsplit("_", 1)[1]
            if not lang:
                continue

            # count translations
            trans_count = 0
            if entry.get("translations") and isinstance(entry.get("translations"), list):
                trans_count += len(entry.get("translations") or [])
            for s in entry.get("senses") or []:
                if isinstance(s, dict) and s.get("translations") and isinstance(s.get("translations"), list):
                    trans_count += len(s.get("translations"))

            desc_count = len((entry.get("descendants") or []) or [])

            lang_trans[lang].append(trans_count)
            lang_desc[lang].append(desc_count)

            seen += 1
            if seen and seen % 10000 == 0:
                print(f"Processed {seen}/{total} entries...")

        mm.close()

    stats = {}
    for lang, arr in lang_trans.items():
        arr_sorted = sorted(arr)
        stats.setdefault(lang, {})
        stats[lang]["translations"] = _percentiles_from_sorted(arr_sorted)

    for lang, arr in lang_desc.items():
        arr_sorted = sorted(arr)
        stats.setdefault(lang, {})
        stats[lang]["descendants"] = _percentiles_from_sorted(arr_sorted)

    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(stats, out, ensure_ascii=False, indent=2)

    print(f"Wrote language stats to {output_path}")


if __name__ == "__main__":
    build_language_stats()
