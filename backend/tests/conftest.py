import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://pdv_api:pdv-api-test-only@localhost:55439/pdv_test",
)
os.environ["PUBLIC_ORIGIN"] = "https://testserver"
from pdv.app import app
from pdv import models as m, auth


@pytest.fixture(autouse=True)
def clean():
    url = os.environ.get(
        "TEST_OWNER_URL",
        "postgresql+psycopg://postgres:pdv-test-only@localhost:55439/pdv_test",
    )
    assert url.rsplit("/", 1)[-1] == "pdv_test", (
        "Destructive tests require database pdv_test"
    )
    owner = create_engine(url)
    with owner.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE users, products, sales, backup_runs, login_attempts RESTART IDENTITY CASCADE"
            )
        )
    with Session(owner) as db:
        db.add(
            m.User(
                login="admin",
                name="Admin",
                role="admin",
                password_hash=auth.hasher.hash("test-password-123"),
            )
        )
        db.add(
            m.User(
                login="operator",
                name="Operator",
                role="operator",
                password_hash=auth.hasher.hash("test-password-123"),
            )
        )
        db.commit()
    yield owner
    owner.dispose()


@pytest.fixture
def client():
    with TestClient(app, base_url="https://testserver") as c:
        c.headers["Origin"] = "https://testserver"
        r = c.post(
            "/api/auth/login", json={"login": "admin", "password": "test-password-123"}
        )
        assert r.status_code == 200, r.text
        c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
        yield c
