#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$ROOT_DIR/backend/prompts.example"
TARGET_DIR="$ROOT_DIR/backend/prompts"

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Prompt templates not found: $TEMPLATE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
added=0

while IFS= read -r -d '' source_file; do
  relative_path="${source_file#"$TEMPLATE_DIR"/}"
  target_file="$TARGET_DIR/$relative_path"

  if [[ ! -f "$target_file" ]]; then
    mkdir -p "$(dirname "$target_file")"
    cp "$source_file" "$target_file"
    echo "Created $target_file"
    added=$((added + 1))
  fi
done < <(find "$TEMPLATE_DIR" -type f -name '*.md' -print0)

if [[ "$added" -eq 0 ]]; then
  echo "Local prompts already exist; no files were overwritten."
else
  echo "Added $added generic prompt file(s) to backend/prompts/."
fi

echo "Customize backend/prompts/ as desired. This directory is excluded from Git and Docker build context."
