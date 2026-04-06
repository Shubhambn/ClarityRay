#!/bin/bash

echo "🚀 Starting ClarityRay Backend..."

cd /home/shubh/Documents/Clarity

# Activate virtual environment
source .venv/bin/activate

# Load API environment (SUPABASE_URL/SUPABASE_KEY) when present
if [ -f "api/.env" ]; then
	set -a
	# shellcheck disable=SC1091
	source api/.env
	set +a
fi

# Export environment variables
export DATABASE_URL="postgresql://postgres:CajlZJPb3YAjKrfr@db.jfqiqeyxnzztvkztinsu.supabase.co:5432/postgres"
export NEXTJS_ORIGIN="http://localhost:3000"

# Start FastAPI server
.venv/bin/uvicorn api.main:app --reload --port 8000
