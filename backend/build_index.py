import json
import os
from collections import defaultdict
from tqdm import tqdm

# File paths
JSONL_FILE_PATH = "wiktionary_data.jsonl"
INDEX_OUTPUT_PATH = "wiktionary_index.json"

def build_index_from_jsonl(jsonl_file_path: str, index_output_path: str) -> None:
    """
    Builds an index from a JSONL file mapping word-language pairs to byte offsets.
    
    Each line in the JSONL file is expected to contain at least:
        - 'word': the word being described
        - 'lang_code': its associated language code
    
    The index allows for quick lookup of entries by recording the byte offsets 
    of each relevant line in the file.
    
    Args:
        jsonl_file_path (str): Path to the input JSONL file.
        index_output_path (str): Path where the index JSON will be saved.
    """
    
    word_lang_index = defaultdict(list)
    record_count = 0

    with open(jsonl_file_path, "r", encoding="utf-8") as jsonl_file:
        # Initialize tqdm progress bar (indeterminate total)
        with tqdm(desc="Indexing records", unit=" lines") as progress_bar:

            while True:
                byte_offset = jsonl_file.tell()  # Get current byte offset
                line = jsonl_file.readline()

                if not line:
                    break  # End of file

                try:
                    entry = json.loads(line.strip())

                    word = entry.get("word", "").lower()
                    lang_code = entry.get("lang_code", "").lower()

                    if word and lang_code:
                        index_key = f"{word}_{lang_code}"
                        word_lang_index[index_key].append(byte_offset)

                    record_count += 1
                    progress_bar.update(1)  # Increment tqdm bar

                except json.JSONDecodeError:
                    # Ignore malformed lines
                    continue

    save_index_to_json(word_lang_index, index_output_path)

    print(f"Finished indexing {record_count} records to {index_output_path}")


def save_index_to_json(index: defaultdict, output_path: str) -> None:
    """
    Saves the index dictionary to a JSON file.

    Args:
        index (defaultdict): The index mapping word-language keys to byte offsets.
        output_path (str): Path where the JSON index will be saved.
    """
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(dict(index), output_file)


if __name__ == "__main__":
    build_index_from_jsonl(JSONL_FILE_PATH, INDEX_OUTPUT_PATH)
