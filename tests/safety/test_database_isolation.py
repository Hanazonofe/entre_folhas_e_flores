import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from test_support import guarded_engine, install_connection_guard, URL_NAMES

SAFE = "postgresql+psycopg://postgres:pdv-test-only@db:5432/pdv_test"


@pytest.fixture
def boundary(monkeypatch):
    import os

    for name in list(os.environ):
        if (
            name in URL_NAMES
            or name in {n + "_FILE" for n in URL_NAMES}
            or name.startswith("PG")
        ):
            monkeypatch.delenv(name)
    monkeypatch.setenv("PDV_TEST_TARGET", "db:5432")
    calls = []
    import psycopg

    def connect(*args, **kwargs):
        calls.append(True)
        raise AssertionError("No real connection is allowed in this test")

    monkeypatch.setattr(psycopg, "connect", connect)
    return calls


# @principle:P-004
@pytest.mark.parametrize("name", URL_NAMES)
@pytest.mark.parametrize(
    "value",
    [
        SAFE.replace("@db:", "@production.invalid:"),
        SAFE.replace("5432", "5433"),
        SAFE.replace("/pdv_test", "/pdv"),
        SAFE + "?host=production.invalid",
        SAFE.replace("pdv-test-only", "not-authorized-test-only"),
    ],
)
def test_database_setup_rejects_unauthorized_targets(
    boundary, monkeypatch, name, value
):
    monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError, match="Unauthorized"):
        guarded_engine(SAFE)
    assert boundary == []


# @principle:P-004
@pytest.mark.parametrize(
    "name", [n + "_FILE" for n in URL_NAMES] + ["PGHOST", "PGSERVICE"]
)
def test_database_setup_rejects_alternative_sources(boundary, monkeypatch, name):
    monkeypatch.setenv(name, "/must-not-be-read")
    with pytest.raises(RuntimeError, match="Unauthorized"):
        guarded_engine(SAFE)
    assert boundary == []


# @principle:P-004
def test_connection_guard_refuses_bypass_and_requires_runner(boundary, monkeypatch):
    from sqlalchemy import create_engine

    guard = install_connection_guard()
    try:
        db = create_engine(SAFE.replace("@db:", "@production.invalid:"))
        with (
            pytest.raises(RuntimeError, match="Unauthorized test database target"),
            db.connect(),
        ):
            pass
        assert boundary == []
        db.dispose()
        safe = guarded_engine(SAFE)
        assert safe.url.database == "pdv_test"
        safe.dispose()
        monkeypatch.delenv("PDV_TEST_TARGET")
        with pytest.raises(RuntimeError, match="Unauthorized"):
            guarded_engine(SAFE)
        assert boundary == []
    finally:
        event.remove(Engine, "do_connect", guard)
