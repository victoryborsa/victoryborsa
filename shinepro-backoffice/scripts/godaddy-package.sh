#!/bin/sh
# Builds shinepro-backoffice-godaddy.zip: the back office ready to upload to GoDaddy Node.js Hosting.
# Leaves out node_modules (GoDaddy installs packages itself), local data, tests and secrets.
set -e
cd "$(dirname "$0")/.."
OUT="${1:-shinepro-backoffice-godaddy.zip}"
rm -f "$OUT"
zip -qr "$OUT" package.json package-lock.json .npmrc src public knowledge.md README.md \
  -x '*.DS_Store' 'public/fonts/*.txt'
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
