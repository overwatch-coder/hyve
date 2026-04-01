"""
Product image storage helpers.

Uploaded images are stored at:  backend/static/product-images/<filename>
They are served by FastAPI StaticFiles at:  /static/product-images/<filename>
BACKEND_URL is used to build fully-qualified public URLs.
"""
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

# ── constants ──────────────────────────────────────────────────────────
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

STATIC_DIR = Path(__file__).parent.parent / "static" / "product-images"


def _backend_url() -> str:
    return os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")


def ensure_upload_dir() -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)


async def save_product_image(file: UploadFile) -> str:
    """
    Validate and persist an uploaded image file.
    Returns the public URL for the saved image.
    Raises HTTPException(400) on validation failure.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{file.content_type}'. Allowed: {', '.join(ALLOWED_TYPES)}.",
        )

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large ({len(contents) // 1024} KB). Maximum is {MAX_SIZE_BYTES // 1024} KB.",
        )

    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"

    ensure_upload_dir()
    filename = f"{uuid.uuid4().hex}.{ext}"
    dest = STATIC_DIR / filename
    dest.write_bytes(contents)

    return f"{_backend_url()}/static/product-images/{filename}"


def normalize_image_url(raw: str | None) -> str | None:
    """
    Accept an external image URL as-is after basic validation.
    Returns None for empty/whitespace inputs.
    """
    if not raw:
        return None
    raw = raw.strip()
    if not raw.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="image_url must be an absolute http/https URL.",
        )
    return raw
