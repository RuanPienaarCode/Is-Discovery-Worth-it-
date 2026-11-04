#!/bin/bash
# Deploy the built artifacts into the vault and PROVE they landed.
set -euo pipefail
cd "$(dirname "$0")/.."
VAULT="${DISCOVERY_WORTH_IT_VAULT_PATH:?set DISCOVERY_WORTH_IT_VAULT_PATH to the vault folder to deploy into}"
DEST="$VAULT/.obsidian/plugins/discovery-worth-it"
[ -f main.js ] || { echo "main.js missing — run ./build.sh first" >&2; exit 1; }
mkdir -p "$DEST"
for f in main.js styles.css manifest.json; do cp "$f" "$DEST/$f"; done
fail=0
for f in main.js styles.css manifest.json; do
  a=$(shasum -a 256 "$f" | cut -d' ' -f1)
  b=$(shasum -a 256 "$DEST/$f" | cut -d' ' -f1)
  if [ "$a" = "$b" ]; then echo "  ok   $f  $a"; else echo "  DRIFT $f" >&2; fail=1; fi
done
[ "$fail" = 0 ] || exit 1
echo "Deployed to $DEST"
echo 'In Obsidian: Settings, Community plugins, enable "Is Discovery Worth It" (reload it if it was already on).'
