# =======================
    # TODO: Implement other Hall of Fame categories
    # =======================
    # longest_etymological_chains = ...
    # most_anagrams = ...
    # most_borrowings_same_word_same_language = ...
    # most_etymology_sections = ...
    # most_homophones = ...
    # most_senses = ...
    # most_parts_of_speech = ...
    # most_plurals = ...
    # most_pronunciations = ...
    # most_spellings = ...
    # most_syllables_one_character = ...

import json
import heapq
from collections import defaultdict
from tqdm import tqdm

# File paths
JSONL_FILE_PATH = "data/wiktionary_data.jsonl"
INDEX_OUTPUT_PATH = "data/wiktionary_index.json"
LONGEST_WORDS_OUTPUT_PATH = "data/longest_words.json"
MOST_TRANSLATIONS_OUTPUT_PATH = "data/most_translations.json"
MOST_DESCENDANTS_OUTPUT_PATH = "data/most_descendants.json"

# Languages to exclude from longest word category (sign languages, gloss systems)
SIGN_LANG_CODES = {
    "ase", "icl", "isg", "gsg", "fsl", "dgs", "bfi", "sfb", "vgt", "rsl", "tsl",
}

def compute_descendant_counts(descendant_links: dict) -> dict:
    """Count the descendants reachable from each node in the descendant graph.

    Returns a ``{node: count}`` mapping. On an acyclic graph the count equals the
    node's subtree size (each child contributes ``1 + count(child)``), matching the
    previous recursive implementation exactly. The difference is robustness:

    * **Iterative** (explicit stack) so arbitrarily deep chains can't raise
      ``RecursionError`` — CPython's default limit is ~1000 frames, and real
      Wiktionary etymology chains exceed that.
    * **Cycle-safe**: edges into a node already on the current DFS path (including
      self-loops) are back-edges and are skipped, so cycles like ``A→B→A`` — which
      the old ``child != root_key`` guard did NOT catch — terminate with a finite
      count instead of overflowing the stack.
    * **Deterministic**: nodes and children are visited in sorted order, so results
      don't depend on hash-randomized ``set``/``dict`` iteration order.

    This counter feeds the offline, non-critical "most descendants" stat; a cyclic
    etymology dump must never be able to crash the index build (and thus FastAPI
    startup) again.
    """
    counts: dict = {}  # node -> finished descendant count (memo)
    for start in sorted(descendant_links.keys()):
        if start in counts:
            continue
        stack = [(start, iter(sorted(descendant_links.get(start, ()))))]
        on_path = {start}
        while stack:
            node, children = stack[-1]
            descend = False
            for child in children:
                if child in on_path or child in counts:
                    # Back-edge (cycle/self-loop) or already-counted node: don't
                    # recurse. Its contribution is added at finalization below.
                    continue
                stack.append((child, iter(sorted(descendant_links.get(child, ())))))
                on_path.add(child)
                descend = True
                break
            if descend:
                continue
            # All children exhausted -> finalize this node in post-order.
            total = 0
            for child in descendant_links.get(node, ()):
                if child in counts:  # back-edges aren't in counts -> contribute 0
                    total += counts[child] + 1
            counts[node] = total
            on_path.discard(node)
            stack.pop()
    return counts


def build_index_from_jsonl(jsonl_file_path: str, index_output_path: str) -> None:
    """
    Builds a byte-offset index for fast lookup and precomputes Hall of Fame data:
    - Longest words (excluding sign languages and phrases)
    - Most translations
    - Most descendants (via reverse descendant links)
    """

    word_lang_index = dict()
    record_count = 0

    TOP_N = 100
    longest_words_heap = []
    most_translations_heap = []

    # Optimized memory: store only keys, not full entries
    all_entry_keys = set()

    # Local descendant graph used only for the offline "most descendants" stat.
    descendant_links = defaultdict(set)

    def add_descendant_link(parent_word: str, parent_lang: str, child_key: str) -> None:
        parent_word = (parent_word or "").strip().lower()
        parent_lang = (parent_lang or "").strip().lower()
        if not parent_word or not child_key:
            return

        exact_key = f"{parent_word}_{parent_lang}" if parent_lang else None
        if exact_key:
            descendant_links[exact_key].add(child_key)
        descendant_links[parent_word].add(child_key)

    with open(jsonl_file_path, "r", encoding="utf-8") as jsonl_file:
        with tqdm(desc="Indexing records", unit=" lines") as progress_bar:
            while True:
                byte_offset = jsonl_file.tell()
                line = jsonl_file.readline()
                if not line:
                    break

                try:
                    entry = json.loads(line.strip())
                    word = entry.get("word", "").lower()
                    lang_code = entry.get("lang_code", "").lower()

                    if word and lang_code:
                        index_key = f"{word}_{lang_code}"
                        if index_key not in word_lang_index:
                            word_lang_index[index_key] = byte_offset
                        all_entry_keys.add(index_key)

                        pos = entry.get("pos", "").lower()

                        # ✅ Longest words (exclude sign languages + phrases)
                        if lang_code not in SIGN_LANG_CODES and pos != "phrase":
                            word_len = len(word)
                            heapq.heappush(longest_words_heap, (word_len, word, lang_code))
                            if len(longest_words_heap) > TOP_N:
                                heapq.heappop(longest_words_heap)

                        # ✅ Most translations
                        translations = entry.get("translations", [])
                        num_translations = len(translations)
                        if num_translations > 0:
                            heapq.heappush(most_translations_heap, (num_translations, word, lang_code))
                            if len(most_translations_heap) > TOP_N:
                                heapq.heappop(most_translations_heap)

                        # ✅ Local descendant graph for offline descendant-count stats
                        descendants = entry.get("descendants", [])
                        for desc in descendants:
                            text = desc.get("text", "")
                            if ":" in text:
                                lang_part, word_part = text.split(":", 1)
                                lang = lang_part.strip().lower()
                                child_word = word_part.strip().split(" ", 1)[0]
                                if child_word:
                                    child_key = f"{child_word.lower()}_{lang}"
                                    add_descendant_link(word, lang_code, child_key)

                        for tpl in entry.get("etymology_templates", []) or []:
                            if not tpl or not isinstance(tpl, dict):
                                continue
                            args = tpl.get("args") or {}
                            parent_word = args.get("3")
                            parent_lang = args.get("2")
                            tr = args.get("tr")
                            use_word = tr or parent_word
                            if not use_word:
                                continue
                            add_descendant_link(str(use_word), str(parent_lang or ""), index_key)

                    record_count += 1
                    progress_bar.update(1)

                except json.JSONDecodeError:
                    continue

    # Save index
    save_index_to_json(word_lang_index, index_output_path)

    # Save longest words
    longest_words_sorted = sorted(longest_words_heap, reverse=True)
    longest_words_output = [
        {"word": word, "lang_code": lang_code, "length": length}
        for length, word, lang_code in longest_words_sorted
    ]
    save_json(longest_words_output, LONGEST_WORDS_OUTPUT_PATH)

    # Save most translations
    most_translations_sorted = sorted(most_translations_heap, reverse=True)
    most_translations_output = [
        {"word": word, "lang_code": lang_code, "translation_count": count}
        for count, word, lang_code in most_translations_sorted
    ]
    save_json(most_translations_output, MOST_TRANSLATIONS_OUTPUT_PATH)

    # ✅ Most descendants (cycle-safe, iterative — see compute_descendant_counts).
    # This stat is non-critical. A failure here must never abort the index build,
    # because build_index.py runs at FastAPI startup with check=True: a non-zero
    # exit fails app startup and crash-loops the container. On error we log and
    # write an empty file so startup can still complete.
    try:
        descendant_counts = compute_descendant_counts(descendant_links)
        descendant_count_heap = []
        for key in tqdm(all_entry_keys, desc="Counting descendants"):
            count = descendant_counts.get(key, 0)
            if count > 0:
                word, lang_code = key.rsplit("_", 1)
                heapq.heappush(descendant_count_heap, (count, word, lang_code))
                if len(descendant_count_heap) > TOP_N:
                    heapq.heappop(descendant_count_heap)

        most_descendants_sorted = sorted(descendant_count_heap, reverse=True)
        most_descendants_output = [
            {"word": word, "lang_code": lang_code, "descendant_count": count}
            for count, word, lang_code in most_descendants_sorted
        ]
    except Exception as exc:  # pragma: no cover - defensive guard
        print(f"[WARN] Failed to compute most-descendants stat; writing empty file: {exc}")
        most_descendants_output = []
    save_json(most_descendants_output, MOST_DESCENDANTS_OUTPUT_PATH)

    print(f"Indexed {record_count} records.")
    print(f"Saved Top {TOP_N} longest words to {LONGEST_WORDS_OUTPUT_PATH}")
    print(f"Saved Top {TOP_N} entries with most translations to {MOST_TRANSLATIONS_OUTPUT_PATH}")
    print(f"Saved Top {TOP_N} entries with most descendants to {MOST_DESCENDANTS_OUTPUT_PATH}")

def save_index_to_json(index: defaultdict, output_path: str) -> None:
    """Serialize the word-lang byte-offset index to JSON."""
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(dict(index), output_file)

def save_json(data, output_path: str) -> None:
    """Generic helper to save a data structure as pretty-printed JSON."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    build_index_from_jsonl(JSONL_FILE_PATH, INDEX_OUTPUT_PATH)
