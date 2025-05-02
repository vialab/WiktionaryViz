import json
import heapq
from collections import defaultdict
from tqdm import tqdm

# File paths
JSONL_FILE_PATH = "wiktionary_data.jsonl"
INDEX_OUTPUT_PATH = "wiktionary_index.json"
LONGEST_WORDS_OUTPUT_PATH = "longest_words.json"

# Languages to exclude from longest word category (sign languages, gloss systems)
SIGN_LANG_CODES = {
    "ase",  # American Sign Language
    "icl",  # International Sign
    "isg",  # Irish Sign Language
    "gsg",  # German Sign Language
    "fsl",  # French Sign Language
    "dgs",  # German Sign Language (alt code)
    "bfi",  # British Sign Language
    "sfb",  # Swiss-French Sign Language
    "vgt",  # Flemish Sign Language
    "rsl",  # Russian Sign Language
    "tsl",  # Thai Sign Language
}

def build_index_from_jsonl(jsonl_file_path: str, index_output_path: str) -> None:
    """
    Builds a byte-offset index for fast lookup and precomputes Hall of Fame data (e.g., longest words).
    """

    word_lang_index = defaultdict(list)
    record_count = 0

    TOP_N = 100
    longest_words_heap = []

    # =======================
    # TODO: Initialize other Hall of Fame categories
    # =======================
    # longest_etymological_chains = ...
    # most_anagrams = ...
    # most_borrowings_same_word_same_language = ...
    # most_descendants = ...
    # most_etymology_sections = ...
    # most_homophones = ...
    # most_senses = ...
    # most_parts_of_speech = ...
    # most_plurals = ...
    # most_pronunciations = ...
    # most_spellings = ...
    # most_syllables_one_character = ...
    # most_translations = ...

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
                        word_lang_index[index_key].append(byte_offset)

                        # ✅ Longest words (exclude sign language codes)
                        if lang_code not in SIGN_LANG_CODES:
                            word_len = len(word)
                            heapq.heappush(longest_words_heap, (word_len, word, lang_code))
                            if len(longest_words_heap) > TOP_N:
                                heapq.heappop(longest_words_heap)

                        # TODO: Update other Hall of Fame category structures here

                    record_count += 1
                    progress_bar.update(1)

                except json.JSONDecodeError:
                    continue

    save_index_to_json(word_lang_index, index_output_path)

    longest_words_sorted = sorted(longest_words_heap, reverse=True)
    longest_words_output = [
        {"word": word, "lang_code": lang_code, "length": length}
        for length, word, lang_code in longest_words_sorted
    ]
    save_json(longest_words_output, LONGEST_WORDS_OUTPUT_PATH)

    print(f"Indexed {record_count} records.")
    print(f"Saved Top {TOP_N} longest words to {LONGEST_WORDS_OUTPUT_PATH}")


def save_index_to_json(index: defaultdict, output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(dict(index), output_file)


def save_json(data, output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    build_index_from_jsonl(JSONL_FILE_PATH, INDEX_OUTPUT_PATH)
