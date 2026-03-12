#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf "\n[%s] %s\n" "$(date +"%Y-%m-%d %H:%M:%S")" "$*"
}

fail() {
  printf "\nError: %s\n" "$*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is required but not found in PATH."
command -v npm >/dev/null 2>&1 || fail "npm is required but not found in PATH."

if [ ! -f package.json ]; then
  fail "package.json not found. Run this script from ajibsglobal-backend or keep it inside that folder."
fi

if [ ! -f .env ] && [ -z "${DATABASE_URL:-}" ]; then
  fail "No .env file found and DATABASE_URL is not set in the environment."
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  if ! grep -Eq '^[[:space:]]*DATABASE_URL=' .env; then
    fail "DATABASE_URL is missing in .env"
  fi
fi

log "Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

log "Generating Prisma client"
npx prisma generate

log "Applying database migrations"
if ! npx prisma migrate deploy; then
  log "migrate deploy failed, trying migrate dev for local setup"
  npx prisma migrate dev --name init --skip-generate
fi

log "Running seeders"
npm run seed

log "Backend setup and seeding completed successfully"
