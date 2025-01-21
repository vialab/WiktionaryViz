import json

# Constants
FILE_PATH = 'raw-wiktextract-data.jsonl'  # Replace with your JSONL file path
SEARCH_KEY = "word"  # Key to search
SEARCH_VALUE = "oranye"  # Value to match
OUTPUT_FILE_SEARCH = 'search_results.json'  # File to save search results
OUTPUT_FILE_TOP_50 = 'top_50_etymology_counts.json'  # File to save the top 50 results
UNWANTED_CATEGORIES = {"th:Cities in Thailand", "th:National capitals", "th:Places in Thailand"}  # Categories to exclude


def search_jsonl(file_path, search_key, search_value):
    """
    Search JSONL file for records with a specific key-value pair.
    """
    matches = []
    with open(file_path, 'r', encoding='utf-8') as file:
        for line in file:
            try:
                record = json.loads(line)
                # Check if the record matches the search criteria
                if record.get(search_key) == search_value:
                    matches.append(record)
            except json.JSONDecodeError:
                print(f"Skipping invalid JSON line: {line}")
    return matches


def clean_and_filter_etymology_templates(record):
    """
    Deduplicate and filter the 'etymology_templates' field in a record to include only 'bor' and 'der'.
    """
    if "etymology_templates" not in record:
        return record

    templates = record["etymology_templates"]
    seen = set()
    filtered_templates = []

    for template in templates:
        # Only keep templates with 'bor' or 'der' in their 'name' field
        if template["name"] in {"bor", "der"}:
            unique_id = (template["name"], json.dumps(template["args"], sort_keys=True))
            if unique_id not in seen:
                seen.add(unique_id)
                filtered_templates.append(template)

    record["etymology_templates"] = filtered_templates
    return record


def filter_records(record):
    """
    Apply additional filtering for records:
    - Exclude proper nouns or names.
    - Exclude composed words.
    - Exclude records belonging to unwanted categories.
    """
    # Exclude proper nouns or names
    if record.get("pos") == "name":
        return None

    # Exclude composed words
    if "etymology_text" in record and "composed of" in record["etymology_text"].lower():
        return None

    # Exclude unwanted categories
    categories = set(record.get("senses", [{}])[0].get("categories", []))
    if categories & UNWANTED_CATEGORIES:
        return None

    return record


def find_top_etymology(file_path, top_n=50):
    """
    Find the top N records with the highest number of 'bor' and 'der' elements in 'etymology_templates',
    after applying filtering.
    """
    word_counts = []

    with open(file_path, 'r', encoding='utf-8') as file:
        for line in file:
            try:
                record = json.loads(line)
                # Filter out unwanted records
                filtered_record = filter_records(record)
                if not filtered_record:
                    continue

                # Filter and clean the 'etymology_templates' field if it exists
                if "etymology_templates" in filtered_record:
                    filtered_record = clean_and_filter_etymology_templates(filtered_record)
                    count = len(filtered_record["etymology_templates"])
                    word_counts.append((filtered_record.get("word", "unknown"), count))
            except json.JSONDecodeError:
                print(f"Skipping invalid JSON line: {line}")

    # Sort by count in descending order and take the top N
    top_words = sorted(word_counts, key=lambda x: x[1], reverse=True)[:top_n]
    return top_words


# Example Usage: Find the top 50 words with the highest etymology counts
top_words = find_top_etymology(FILE_PATH, top_n=50)
with open(OUTPUT_FILE_TOP_50, 'w', encoding='utf-8') as file:
    json.dump(top_words, file, indent=4)

print(f"Top 50 words with the highest etymology counts saved to {OUTPUT_FILE_TOP_50}.")
