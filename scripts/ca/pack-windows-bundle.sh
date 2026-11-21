#!/usr/bin/env bash
# Build the canonical Windows source bundle. No SDK or npm dependencies required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/CodeAgent-Windows-Setup.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/scripts/ca" "$STAGE/scripts/coding-assistant" "$STAGE/docs/coding-assistant"
cp "$ROOT/CA-Setup.cmd" "$STAGE/CA-Setup.cmd"
cp "$ROOT/scripts/ca/setup.ps1" "$STAGE/scripts/ca/setup.ps1"
cp "$ROOT/scripts/ca/Choose-Model.ps1" "$STAGE/scripts/ca/Choose-Model.ps1"
cp "$ROOT/scripts/ca/Select-CodingModel.ps1" "$STAGE/scripts/ca/Select-CodingModel.ps1"
cp "$ROOT/scripts/ca/WINDOWS-LONG-PATHS.txt" "$STAGE/README.txt"
cp -R "$ROOT/scripts/coding-assistant/chat-ui" "$STAGE/scripts/coding-assistant/chat-ui"
rm -rf "$STAGE/scripts/coding-assistant/chat-ui/node_modules"
cp -R "$ROOT/scripts/coding-assistant/domain-skills" "$STAGE/scripts/coding-assistant/domain-skills"
cp -R "$ROOT/docs/coding-assistant/context" "$STAGE/docs/coding-assistant/context"

for required in server.mjs index.html chat-stream.mjs open-app.ps1 manifest.webmanifest sw.js package.json package-lock.json; do
  test -f "$STAGE/scripts/coding-assistant/chat-ui/$required"
done

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT" "$OUT.sha256"
( cd "$STAGE" && zip -qr "$OUT" . )
sha256sum "$OUT" > "$OUT.sha256"
echo "Wrote $OUT"
