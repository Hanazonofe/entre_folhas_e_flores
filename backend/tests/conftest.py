import os
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from test_support import guarded_engine, install_connection_guard, validate_environment

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://pdv_api:pdv-api-test-only@localhost:55439/pdv_test",
)
os.environ["PUBLIC_ORIGIN"] = "https://testserver"
install_connection_guard()
from pdv.app import app
from pdv import models as m, auth


@pytest.fixture(autouse=True)
def clean():
    validate_environment()
    url = os.environ.get(
        "TEST_OWNER_URL",
        "postgresql+psycopg://postgres:pdv-test-only@localhost:55439/pdv_test",
    )
    assert url.rsplit("/", 1)[-1] == "pdv_test", (
        "Destructive tests require database pdv_test"
    )
    owner = guarded_engine(url)
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


@pytest.fixture
def local_only_network(monkeypatch, clean):
    """TestClient is in-process; only the provisioned PostgreSQL may use TCP."""
    import socket

    host, port = clean.url.host, clean.url.port
    resolve = socket.getaddrinfo
    addresses = {r[4][0] for r in resolve(host, port, type=socket.SOCK_STREAM)}
    connect = socket.socket.connect
    connect_ex = socket.socket.connect_ex

    def local_dns(name, service, *args, **kwargs):
        if name not in {host, *addresses} or int(service) != port:
            raise AssertionError("External DNS/network is forbidden in the local flow")
        return resolve(name, service, *args, **kwargs)

    def check(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6):
            if address[0] not in addresses or address[1] != port:
                raise AssertionError("External network is forbidden in the local flow")

    def local_connect(sock, address):
        check(sock, address)
        return connect(sock, address)

    def local_connect_ex(sock, address):
        check(sock, address)
        return connect_ex(sock, address)

    monkeypatch.setattr(socket, "getaddrinfo", local_dns)
    monkeypatch.setattr(socket.socket, "connect", local_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", local_connect_ex)
    # Verify the boundary without making any external connection.
    with pytest.raises(AssertionError, match="External"):
        socket.getaddrinfo("external.invalid", 443)
    with socket.socket() as sock, pytest.raises(AssertionError, match="External"):
        sock.connect(("192.0.2.1", 443))
