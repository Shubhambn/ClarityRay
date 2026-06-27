#!/usr/bin/env python3
"""Seed the Supabase model registry from the on-disk model catalog.

Generic and idempotent: reads ``public/models/manifest.json`` and each model's
``clarity.json``, then upserts a ``models`` row + a ``model_versions`` row for
every model present on disk. Re-running is safe — existing rows are updated, not
duplicated (upsert on ``slug`` / ``(model_id, version)``).

This onboards local models to the platform DB so the FastAPI ``/models`` and
``/models/{slug}`` endpoints (and therefore the model detail pages) resolve them
instead of returning 404.

Usage:
    python scripts/seed_supabase.py            # seed every model in the manifest
    python scripts/seed_supabase.py --slug resnet50-cxr-suspicious
    python scripts/seed_supabase.py --list     # show DB vs disk, write nothing

Credentials come from api/.env (SUPABASE_URL / SUPABASE_KEY). Writing requires a
key with insert/update rights on the models tables — typically the service_role
(secret) key. A publishable/anon key works only if RLS permits writes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

REPO_ROOT = Path(__file__).resolve().parents[1]
MODELS_ROOT = REPO_ROOT / "public" / "models"
MANIFEST_PATH = MODELS_ROOT / "manifest.json"
API_ENV_PATH = REPO_ROOT / "api" / ".env"


def _load_env(path: Path) -> dict[str, str]:
    """Minimal .env reader (no external dependency)."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def _supabase_request(
    base_url: str,
    key: str,
    *,
    method: str,
    table: str,
    query: dict[str, str] | None = None,
    payload: object | None = None,
    prefer: str | None = None,
) -> tuple[int, dict[str, str], object]:
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    if query:
        url = f"{url}?{urllib_parse.urlencode(query, safe='(),.*')}"

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib_request.Request(url=url, data=body, headers=headers, method=method)

    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")
            parsed = json.loads(text) if text else []
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, resp_headers, parsed
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Supabase HTTP {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Supabase connection error: {exc.reason}") from exc


def _discover_models(only_slug: str | None) -> list[tuple[str, dict]]:
    """Return [(slug, manifest_entry)] for models that exist on disk."""
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = manifest.get("models", {})
    out: list[tuple[str, dict]] = []
    for slug, entry in entries.items():
        if only_slug and slug != only_slug:
            continue
        clarity = MODELS_ROOT / slug / "clarity.json"
        onnx = MODELS_ROOT / slug / "model.onnx"
        if not clarity.exists() or not onnx.exists():
            print(f"  ! skipping '{slug}': missing model.onnx or clarity.json on disk")
            continue
        out.append((slug, entry))
    return out


def _seed_one(base_url: str, key: str, slug: str, entry: dict) -> bool:
    spec = json.loads((MODELS_ROOT / slug / "clarity.json").read_text(encoding="utf-8"))
    name = spec.get("name", slug)
    bodypart = spec.get("bodypart")
    modality = spec.get("modality")
    version = spec.get("version", entry.get("version", "1.0.0"))
    model_url = entry.get("url", spec.get("model", {}).get("file"))
    clarity_url = entry.get("spec_url", f"/models/{slug}/clarity.json")

    print(f"\n=== {slug} ===")
    # 1) upsert model row (unique on slug), published so it's visible
    _, _, model_rows = _supabase_request(
        base_url,
        key,
        method="POST",
        table="models",
        query={"on_conflict": "slug"},
        payload=[
            {
                "slug": slug,
                "name": name,
                "bodypart": bodypart,
                "modality": modality,
                "status": "published",
            }
        ],
        prefer="resolution=merge-duplicates,return=representation",
    )
    if not model_rows:
        # merge-duplicates with return=representation should echo the row; if a
        # proxy stripped it, fall back to a lookup.
        _, _, model_rows = _supabase_request(
            base_url,
            key,
            method="GET",
            table="models",
            query={"select": "id,slug", "slug": f"eq.{slug}", "limit": "1"},
        )
    model_id = model_rows[0]["id"]
    print(f"  - model row upserted (id {model_id}, status published)")

    # 2) upsert version row (unique on model_id, version)
    # Include spec_json so /api/models/[slug]/spec can serve it without
    # a local file on the deployed platform.
    _supabase_request(
        base_url,
        key,
        method="POST",
        table="model_versions",
        query={"on_conflict": "model_id,version"},
        payload=[
            {
                "model_id": model_id,
                "version": version,
                "clarity_url": clarity_url,
                "model_url": model_url,
                "spec_json": spec,
            }
        ],
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"  - version {version} upserted ({model_url})")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--slug", help="seed only this slug (default: all in manifest)")
    parser.add_argument("--list", action="store_true", help="show DB vs disk and exit (no writes)")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    env = _load_env(API_ENV_PATH)
    base_url = env.get("SUPABASE_URL")
    # Service role key bypasses RLS (required for inserts). Fall back to anon key
    # only for read-only operations like --list.
    key = env.get("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_KEY")
    if not base_url or not key:
        print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_KEY in api/.env", file=sys.stderr)
        return 2

    targets = _discover_models(args.slug)
    if not targets:
        print("No on-disk models to seed.", file=sys.stderr)
        return 2

    if args.list:
        _, hdr, rows = _supabase_request(
            base_url, key, method="GET", table="models",
            query={"select": "slug,status"}, prefer="count=exact",
        )
        db_slugs = {r["slug"]: r["status"] for r in rows}
        print(f"DB models ({hdr.get('content-range', '?')}):")
        for s, st in db_slugs.items():
            print(f"  - {s} [{st}]")
        print("\nOn-disk models (manifest):")
        for slug, _ in targets:
            mark = "in DB" if slug in db_slugs else "MISSING from DB"
            print(f"  - {slug} ({mark})")
        return 0

    print(f"Seeding {len(targets)} model(s) into {base_url}")
    seeded = 0
    for slug, entry in targets:
        try:
            if _seed_one(base_url, key, slug, entry):
                seeded += 1
        except RuntimeError as exc:
            print(f"  FAIL: {exc}", file=sys.stderr)

    print(f"\nDone. Seeded {seeded}/{len(targets)} model(s).")
    return 0 if seeded == len(targets) else 1


if __name__ == "__main__":
    raise SystemExit(main())
