from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings
from api.routes.models import router as models_router

settings = get_settings()

app = FastAPI(title="ClarityRay API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.nextjs_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
