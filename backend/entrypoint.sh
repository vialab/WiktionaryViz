#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/app/data"
TARGET_JSONL="${DATA_DIR}/wiktionary_data.jsonl"
URL_DEFAULT="https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz"
URL="${WIKTIONARY_DATA_URL:-$URL_DEFAULT}"
SKIP_DOWNLOAD="${SKIP_DOWNLOAD:-0}"

echo "[entrypoint] Data dir: ${DATA_DIR}"
mkdir -p "${DATA_DIR}"

if [[ "${SKIP_DOWNLOAD}" != "1" && ! -s "${TARGET_JSONL}" ]]; then
  echo "[entrypoint] wiktionary_data.jsonl not found. Downloading from: ${URL}"
  TMP_PATH="${DATA_DIR}/raw_download"
  rm -f "${TMP_PATH}" "${TMP_PATH}.gz" || true

  if [[ "${URL}" == *.gz ]]; then
    echo "[entrypoint] Downloading compressed (.gz) file..."
    curl -L --fail --retry 3 -o "${TMP_PATH}.gz" "${URL}"
    echo "[entrypoint] Unzipping to ${TARGET_JSONL} (this may take a while)..."
    gunzip -c "${TMP_PATH}.gz" > "${TARGET_JSONL}"
    rm -f "${TMP_PATH}.gz"
  else
    echo "[entrypoint] Downloading uncompressed JSONL..."
    curl -L --fail --retry 3 -o "${TARGET_JSONL}" "${URL}"
  fi
  echo "[entrypoint] Download complete: ${TARGET_JSONL}"
else
  if [[ -s "${TARGET_JSONL}" ]]; then
    echo "[entrypoint] Found existing data file: ${TARGET_JSONL}"
  else
    echo "[entrypoint] SKIP_DOWNLOAD=1 set. Proceeding without ensuring data file exists."
  fi
fi

exec "$@"
