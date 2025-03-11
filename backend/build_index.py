import json
import os

JSONL_FILE_PATH = "wiktionary_data.jsonl"
INDEX_FILE_PATH = "wiktionary_index.json"

def build_index():
    index = {}

    with open(JSONL_FILE_PATH, "r", encoding="utf-8") as file:
        count = 0

        while True:
            offset = file.tell()  # ✅ Get position before reading the line
            line = file.readline()

            if not line:
                break  # End of file

            try:
                entry = json.loads(line.strip())

                word = entry.get("word", "").lower()
                lang_code = entry.get("lang_code", "").lower()

                if word and lang_code:
                    key = f"{word}_{lang_code}"
                    if key not in index:
                        index[key] = []
                    index[key].append(offset)

                count += 1
                if count % 100000 == 0:
                    print(f"Indexed {count} records...")

            except json.JSONDecodeError:
                continue

    with open(INDEX_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f)

    print(f"✅ Finished indexing {count} records to {INDEX_FILE_PATH}")

if __name__ == "__main__":
    build_index()
