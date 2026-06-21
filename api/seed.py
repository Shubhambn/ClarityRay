import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Read local clarity.json
spec_path = Path(__file__).parent.parent / "public/models/densenet121-chest/clarity.json"


def seed() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY in api/.env")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    with open(spec_path, encoding="utf-8") as f:
        spec = json.load(f)

    slug = spec["id"]

    # Check if already exists
    existing = supabase.table("models").select("id").eq("slug", slug).execute()
    if existing.data:
        model_id = existing.data[0]["id"]
        print(f"Model '{slug}' already exists with id {model_id}")
        # Update to published status
        supabase.table("models").update(
            {
                "status": "published",
                "published_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", model_id).execute()
        print("Updated status to published")
    else:
        model_id = str(uuid.uuid4())
        supabase.table("models").insert(
            {
                "id": model_id,
                "slug": slug,
                "name": spec["name"],
                "bodypart": spec["bodypart"],
                "modality": spec["modality"],
                "task": spec.get("output", {}).get("task", "binary"),
                "validation_status": spec.get("thresholds", {}).get("validation_status", "unvalidated"),
                "safety_tier": spec.get("safety", {}).get("tier", "screening"),
                "status": "published",
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "published_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
        print(f"Created model '{slug}' with id {model_id}")

    # Add version
    version_id = str(uuid.uuid4())

    # Use local paths (fallback) or HF URLs if available
    local_model_url = "/models/densenet121-chest/model.onnx"
    local_spec_url = "/models/densenet121-chest/clarity.json"

    supabase.table("model_versions").insert(
        {
            "id": version_id,
            "model_id": model_id,
            "version": spec.get("version", "1.0.0"),
            "model_url": local_model_url,
            "clarity_url": local_spec_url,
        }
    ).execute()

    print(f"Created version {spec.get('version', '1.0.0')} for model '{slug}'")
    print("Done! Model is now published and visible at /models")


if __name__ == "__main__":
    seed()
