$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20 or newer is required."
}

if (-not (Test-Path "node_modules")) {
  npm ci
}

npm run build
npm run start:prod
