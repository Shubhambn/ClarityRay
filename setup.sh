#!/usr/bin/env bash
# ClarityRay — Linux / macOS Setup Script
# Usage:
#   chmod +x setup.sh && ./setup.sh
#   ./setup.sh --skip-converter   (skip Python converter install)

set -euo pipefail

SKIP_CONVERTER=false
for arg in "$@"; do
  [[ "$arg" == "--skip-converter" ]] && SKIP_CONVERTER=true
done

# ─── Colours ────────────────────────────────────────────────────────────────
CYAN="\033[1;36m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"
RED="\033[1;31m"; GRAY="\033[0;37m"; MAGENTA="\033[1;35m"; RESET="\033[0m"

step() { printf "\n${CYAN}[STEP]${RESET} %s\n" "$1"; }
ok()   { printf "  ${GREEN}[OK]${RESET} %s\n" "$1"; }
warn() { printf "  ${YELLOW}[!!]${RESET} %s\n" "$1"; }
fail() { printf " ${RED}[ERR]${RESET} %s\n" "$1"; exit 1; }
info() { printf "       ${GRAY}%s${RESET}\n" "$1"; }

require_cmd() {
  command -v "$1" &>/dev/null || fail "$1 not found. $2"
}

# ─── Banner ─────────────────────────────────────────────────────────────────
printf "\n${MAGENTA}==========================================\n"
printf "   ClarityRay  —  Local Setup (Linux/Mac)\n"
printf "==========================================${RESET}\n\n"

# ─── 1. Prerequisites ────────────────────────────────────────────────────────
step "Checking prerequisites..."

require_cmd node  "Install Node.js 18+ from https://nodejs.org or use nvm"
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[[ "$NODE_MAJOR" -lt 18 ]] && fail "Node.js 18+ required (found $(node --version)). See https://nodejs.org"
ok "Node.js $(node --version)"

require_cmd npm   "npm is bundled with Node.js — reinstall Node."
ok "npm $(npm --version)"

# Accept both 'python3' and 'python'
PY_CMD=""
if command -v python3 &>/dev/null; then PY_CMD="python3"
elif command -v python &>/dev/null; then PY_CMD="python"
else fail "Python not found. Install Python 3.10+ from https://www.python.org/downloads/ or use pyenv"
fi

PY_VER=$($PY_CMD --version 2>&1 | awk '{print $2}')
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [[ "$PY_MAJOR" -lt 3 || ("$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 10) ]]; then
  fail "Python 3.10+ required (found $PY_VER). Upgrade at https://www.python.org/downloads/"
fi
ok "Python $PY_VER ($PY_CMD)"

PIP_CMD=""
if command -v pip3 &>/dev/null;  then PIP_CMD="pip3"
elif command -v pip &>/dev/null; then PIP_CMD="pip"
else fail "pip not found. Run: $PY_CMD -m ensurepip --upgrade"
fi
ok "pip ($PIP_CMD)"

# ─── 2. Frontend .env ────────────────────────────────────────────────────────
step "Configuring frontend environment..."

if [[ ! -f ".env.local" ]]; then
  cat > .env.local <<'ENV'
NEXT_PUBLIC_API_URL=http://localhost:8000
ENV
  ok "Created .env.local"
else
  ok ".env.local already exists — skipped"
fi

# ─── 3. Frontend dependencies ────────────────────────────────────────────────
step "Installing frontend dependencies (npm install)..."
npm install
ok "Frontend dependencies installed"

# ─── 4. API .env ─────────────────────────────────────────────────────────────
step "Configuring API environment..."

if [[ ! -f "api/.env" ]]; then
  cat > api/.env <<'ENV'
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002

# Leave blank for local degraded mode (no database required)
SUPABASE_URL=
SUPABASE_KEY=
CLARITY_API_KEY=
ENV
  ok "Created api/.env (degraded mode — no DB needed)"
else
  ok "api/.env already exists — skipped"
fi

# ─── 5. API Python dependencies ──────────────────────────────────────────────
step "Installing API Python dependencies..."

(cd api && $PIP_CMD install -r requirements.txt -q)
ok "API dependencies installed"

# ─── 6. Converter (optional) ─────────────────────────────────────────────────
if [[ "$SKIP_CONVERTER" == false ]]; then
  step "Installing converter CLI (optional — skip with --skip-converter)..."
  if (cd converter && $PIP_CMD install -e "." -q 2>/dev/null); then
    ok "Converter CLI installed (run: clarityray --help)"
  else
    warn "Converter install failed — skipping (not required to run the app)"
  fi
else
  info "Converter skipped (--skip-converter flag set)"
fi

# ─── 7. Quick type-check ─────────────────────────────────────────────────────
step "Running TypeScript type check..."
if npx tsc --noEmit; then
  ok "No TypeScript errors"
else
  warn "TypeScript errors found above — app may still run, but fix before committing"
fi

# ─── Done — print run instructions ───────────────────────────────────────────
printf "\n${MAGENTA}==========================================\n"
printf "   Setup complete! How to run ClarityRay  \n"
printf "==========================================${RESET}\n\n"

printf "  Open ${CYAN}TWO${RESET} separate terminals:\n\n"

printf "  ${CYAN}Terminal 1 — Backend API (FastAPI):${RESET}\n"
printf "    ${YELLOW}cd api${RESET}\n"
printf "    ${YELLOW}uvicorn main:app --reload${RESET}\n"
printf "    ${GRAY}-> http://localhost:8000${RESET}\n"
printf "    ${GRAY}-> Docs: http://localhost:8000/docs${RESET}\n\n"

printf "  ${CYAN}Terminal 2 — Frontend (Next.js):${RESET}\n"
printf "    ${YELLOW}npm run dev${RESET}\n"
printf "    ${GRAY}-> http://localhost:3000${RESET}\n\n"

printf "  ${CYAN}Run tests:${RESET}\n"
printf "    ${YELLOW}npm run test${RESET}               (unit tests)\n"
printf "    ${YELLOW}npm run test:e2e${RESET}           (E2E with Playwright, needs app running)\n"
printf "    ${YELLOW}npm run lint${RESET}               (ESLint)\n\n"

printf "  ${CYAN}Converter CLI (publish models):${RESET}\n"
printf "    ${YELLOW}clarityray --help${RESET}\n\n"

printf "  ${GREEN}NOTE: ONNX inference runs entirely in your browser.${RESET}\n"
printf "  ${GREEN}      Patient data never leaves your machine.${RESET}\n\n"
