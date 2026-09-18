"""Read root-only Docker secrets, then drop privileges before serving requests."""

import os
from pathlib import Path

path = os.environ.pop("DATABASE_URL_FILE", None)
if path:
    os.environ["DATABASE_URL"] = Path(path).read_text().strip()
if os.getuid() == 0:
    os.setgroups([])
    os.setgid(10001)
    os.setuid(10001)
os.execvp(
    "uvicorn",
    [
        "uvicorn",
        "pdv.app:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
        "--proxy-headers",
        "--forwarded-allow-ips",
        "*",
    ],
)
