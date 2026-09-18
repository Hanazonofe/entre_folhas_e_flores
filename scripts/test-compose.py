"""Disposable end-to-end HTTPS smoke test. Requires prebuilt pdv-test-* images."""

import os
import shlex
import ssl
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4
import httpx

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
PROJECT = "pdv-compose-tests"
COMPOSE = shlex.split(os.getenv("COMPOSE_BIN", "docker compose"))
for name in ("pdv-test-api", "pdv-test-backup"):
    subprocess.run(
        ["docker", "image", "inspect", name], check=True, stdout=subprocess.DEVNULL
    )
existing = subprocess.check_output(
    ["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={PROJECT}"],
    text=True,
)
if existing.strip():
    raise SystemExit("Test project already exists; refusing to replace it.")
with tempfile.TemporaryDirectory(prefix="pdv-compose-", dir=ROOT.parent) as temporary:
    folder = Path(temporary)
    subprocess.run(
        [
            "python3",
            "scripts/configure.py",
            "--host",
            "localhost",
            "--directory",
            str(folder / "secrets"),
            "--env-file",
            str(folder / "test.env"),
        ],
        check=True,
    )
    override = folder / "override.yaml"
    override.write_text("""services:
  api:
    image: pdv-test-api
  migrate:
    image: pdv-test-api
  backup:
    image: pdv-test-backup
  web:
    ports: !override ["127.0.0.1:55469:443"]
""")
    command = COMPOSE + [
        "--env-file",
        str(folder / "test.env"),
        "-f",
        str(ROOT / "compose.yaml"),
        "-f",
        str(override),
        "-p",
        PROJECT,
    ]

    def compose(*args, **kwargs):
        return subprocess.run(command + list(args), check=True, **kwargs)

    try:
        compose("up", "-d", "--no-build")
        compose(
            "exec",
            "-T",
            "api",
            "python",
            "-",
            input="""from sqlalchemy.orm import Session
from pdv.db import engine
from pdv import models as m, auth
with Session(engine()) as db:
    assert not db.query(m.User).count()
    assert not db.query(m.Product).count()
    assert not db.query(m.Sale).count()
    db.add(m.User(login='qaadmin',name='HTTPS fixture',role='admin',password_hash=auth.hasher.hash('acceptance-test-only')))
    db.commit()
""",
            text=True,
        )
        compose(
            "cp",
            "web:/data/caddy/pki/authorities/local/root.crt",
            str(folder / "root.crt"),
        )
        context = ssl.create_default_context(cafile=str(folder / "root.crt"))
        with httpx.Client(
            base_url="https://localhost:55469",
            verify=context,
            headers={"Origin": "https://localhost"},
        ) as client:

            def login(login):
                r = client.post(
                    "/api/auth/login",
                    json={"login": login, "password": "acceptance-test-only"},
                )
                assert r.status_code == 200, r.text
                client.headers["X-CSRF-Token"] = r.json()["csrf_token"]

            login("qaadmin")
            r = client.post(
                "/api/users",
                json={
                    "login": "qaoperator",
                    "name": "Second device fixture",
                    "role": "operator",
                    "password": "acceptance-test-only",
                },
            )
            assert r.status_code == 201, r.text
            p = client.post(
                "/api/products",
                json={
                    "code": "QA",
                    "name": "HTTPS test",
                    "price_cents": 1234,
                    "stock": -2,
                },
            ).json()
            login("qaoperator")
            assert client.get("/api/users").status_code == 403
            base = {
                "items": [{"product_id": p["id"], "quantity": 1}],
                "discount_cents": 0,
            }
            q = client.post("/api/sales/quote", json=base).json()
            body = {
                **base,
                "quote_token": q["quote_token"],
                "payments": [
                    {"method": "credit", "applied_cents": 1234, "received_cents": 1234}
                ],
            }
            key = str(uuid4())
            response = client.post(
                "/api/sales", json=body, headers={"Idempotency-Key": key}
            )
            assert response.status_code == 201, response.text
            original = response.json()
            compose("restart", "api")
            for attempt in range(50):
                time.sleep(0.2)
                try:
                    if client.get("/api/health").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
            else:
                raise AssertionError("API did not recover")
            repeated = client.post(
                "/api/sales", json=body, headers={"Idempotency-Key": key}
            )
            assert repeated.json() == original, repeated.text
            assert client.get("/api/sales").json()["count"] == 1
            assert client.get("/api/products").json()["items"][0]["stock"] == -2
        compose(
            "exec",
            "-T",
            "api",
            "python",
            "-c",
            'import socket; s=socket.socket(); s.settimeout(2); assert s.connect_ex(("1.1.1.1",443)) != 0',
        )
        print(
            "HTTPS + no API WAN route + empty install + two users + persistence/idempotency on restart: PASS"
        )
    finally:
        compose("down", "-v")  # Only this dedicated test project; never production.
