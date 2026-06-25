#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm ci
fi

npm run build
exec npm run start:prod
