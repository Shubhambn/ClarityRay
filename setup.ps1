# ClarityRay - Windows Setup Script (PowerShell)
# Run from project root:  .\setup.ps1
# Optional flag:          .\setup.ps1 -SkipConverter

param(
    [switch]$SkipConverter
)

$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  [OK] $msg"  -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!!] $msg"  -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host " [ERR] $msg"  -ForegroundColor Red; exit 1 }
function Write-Info { param($msg) Write-Host "       $msg"  -ForegroundColor Gray }

function Require-Cmd {
    param($cmd, $hint)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "$cmd not found. $hint"
    }
}

# Banner
Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "   ClarityRay  -  Local Setup (Windows)  " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

# ---- 1. Prerequisites -------------------------------------------------------
Write-Step "Checking prerequisites..."

Require-Cmd "node" "Install Node.js 18+ from https://nodejs.org"
$nodeVer   = (node --version) -replace "v", ""
$nodeMajor = [int]($nodeVer.Split(".")[0])
if ($nodeMajor -lt 18) {
    Write-Fail "Node.js 18+ required (found v$nodeVer). Upgrade at https://nodejs.org"
}
Write-Ok "Node.js v$nodeVer"

Require-Cmd "npm" "npm is bundled with Node.js - reinstall Node."
Write-Ok "npm $(npm --version)"

# Detect Python - try py launcher first (Windows), then python3, then python
$PY_CMD = $null
foreach ($candidate in @("py", "python3", "python")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $testVer = (& $candidate --version 2>&1).ToString()
        if ($testVer -match "^Python \d") {
            $PY_CMD = $candidate
            break
        }
    }
}
if (-not $PY_CMD) {
    Write-Host ""
    Write-Host " [ERR] Python 3.10+ not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Install it from: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  During install: check 'Add Python to PATH'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  If Python is already installed but blocked by the Windows Store stub:" -ForegroundColor Yellow
    Write-Host "  Settings -> Apps -> Advanced app settings -> App execution aliases" -ForegroundColor Yellow
    Write-Host "  Turn OFF the 'python.exe' and 'python3.exe' toggles, then reopen this terminal." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
$pyVerRaw = (& $PY_CMD --version 2>&1).ToString() -replace "Python ", ""
$pyParts  = $pyVerRaw.Trim().Split(".")
if ([int]$pyParts[0] -lt 3 -or ([int]$pyParts[0] -eq 3 -and [int]$pyParts[1] -lt 10)) {
    Write-Fail "Python 3.10+ required (found $pyVerRaw). Upgrade at https://www.python.org/downloads/"
}
Write-Ok "Python $pyVerRaw (via $PY_CMD)"

# Detect pip matching the Python we found
$PIP_CMD = $null
foreach ($candidate in @("pip3", "pip")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $PIP_CMD = $candidate
        break
    }
}
if (-not $PIP_CMD) {
    # Fall back to python -m pip
    $PIP_CMD = "$PY_CMD -m pip"
}
Write-Ok "pip ready (via $PIP_CMD)"

# ---- 2. Frontend .env -------------------------------------------------------
Write-Step "Configuring frontend environment..."

if (-not (Test-Path ".env.local")) {
    Set-Content -Path ".env.local" -Value "NEXT_PUBLIC_API_URL=http://localhost:8000" -Encoding utf8
    Write-Ok "Created .env.local"
} else {
    Write-Ok ".env.local already exists - skipped"
}

# ---- 3. Frontend dependencies -----------------------------------------------
Write-Step "Installing frontend dependencies (npm install)..."
npm install
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed" }
Write-Ok "Frontend dependencies installed"

# ---- 4. API .env ------------------------------------------------------------
Write-Step "Configuring API environment..."

if (-not (Test-Path "api\.env")) {
    $apiEnvContent = @(
        "PORT=8000",
        "ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002",
        "",
        "# Leave blank for local degraded mode (no database required)",
        "SUPABASE_URL=",
        "SUPABASE_KEY=",
        "CLARITY_API_KEY="
    )
    Set-Content -Path "api\.env" -Value $apiEnvContent -Encoding utf8
    Write-Ok "Created api/.env (degraded mode - no DB required)"
} else {
    Write-Ok "api/.env already exists - skipped"
}

# ---- 5. API Python dependencies ---------------------------------------------
Write-Step "Installing API Python dependencies..."

Push-Location "api"
try {
    if ($PIP_CMD -like "* -m pip") {
        Invoke-Expression "$PIP_CMD install -r requirements.txt --quiet"
    } else {
        & $PIP_CMD install -r requirements.txt --quiet
    }
    if ($LASTEXITCODE -ne 0) { Write-Fail "pip install failed for api/requirements.txt" }
    Write-Ok "API dependencies installed"
} finally {
    Pop-Location
}

# ---- 6. Converter CLI (optional) --------------------------------------------
if (-not $SkipConverter) {
    Write-Step "Installing converter CLI (optional - pass -SkipConverter to skip)..."
    Push-Location "converter"
    try {
        if ($PIP_CMD -like "* -m pip") {
            Invoke-Expression "$PIP_CMD install -e . --quiet"
        } else {
            & $PIP_CMD install -e "." --quiet
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Converter CLI installed  ->  clarityray --help"
        } else {
            Write-Warn "Converter install failed - skipping (not required to run the app)"
        }
    } catch {
        Write-Warn "Converter install error - skipping (not required to run the app)"
    } finally {
        Pop-Location
    }
} else {
    Write-Info "Converter skipped (-SkipConverter flag set)"
}

# ---- 7. TypeScript type-check -----------------------------------------------
Write-Step "Running TypeScript type check..."
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Warn "TypeScript errors found above - fix before committing"
} else {
    Write-Ok "No TypeScript errors"
}

# ---- Done -------------------------------------------------------------------
Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  Setup complete!  How to run ClarityRay  " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Open TWO separate terminals:" -ForegroundColor White
Write-Host ""
Write-Host "  Terminal 1 - Backend API (FastAPI):" -ForegroundColor Cyan
Write-Host "    cd api" -ForegroundColor Yellow
Write-Host "    uvicorn main:app --reload" -ForegroundColor Yellow
Write-Host "    -> http://localhost:8000" -ForegroundColor Gray
Write-Host "    -> Swagger docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host ""
Write-Host "  Terminal 2 - Frontend (Next.js):" -ForegroundColor Cyan
Write-Host "    npm run dev" -ForegroundColor Yellow
Write-Host "    -> http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "  Tests:" -ForegroundColor Cyan
Write-Host "    npm run test            (unit tests - Vitest)" -ForegroundColor Yellow
Write-Host "    npm run test:e2e        (E2E - Playwright, needs app running)" -ForegroundColor Yellow
Write-Host "    npm run lint            (ESLint)" -ForegroundColor Yellow
Write-Host "    npx tsc --noEmit       (TypeScript check)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Converter CLI (publish/validate models):" -ForegroundColor Cyan
Write-Host "    clarityray --help" -ForegroundColor Yellow
Write-Host ""
Write-Host "  NOTE: All ONNX inference runs in your browser." -ForegroundColor Green
Write-Host "        Patient data never leaves your machine." -ForegroundColor Green
Write-Host ""
