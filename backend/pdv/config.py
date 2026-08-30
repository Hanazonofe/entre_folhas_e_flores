import os
from pathlib import Path


def secret(name: str, default: str = "") -> str:
    file = os.getenv(f"{name}_FILE")
    return Path(file).read_text().strip() if file else os.getenv(name, default)


def database_url() -> str:
    url = secret("DATABASE_URL")
    if not url:
        raise RuntimeError("Configure DATABASE_URL ou DATABASE_URL_FILE.")
    return url


def public_origin() -> str:
    return os.getenv("PUBLIC_ORIGIN", "https://localhost").rstrip("/")
