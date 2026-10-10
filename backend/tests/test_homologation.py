"""Sanitization and target guards use the disposable test DB only."""
import copy
import json
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from pdv import homologation as h, models as m
from pdv.db import engine


@pytest.mark.parametrize("_spec", ["@spec:AC-060 exportação sanitizada"])
def test_export_excludes_credentials_and_operational_tables(_spec):
    from sqlalchemy.orm import Session
    with Session(engine()) as db:
        user = db.scalar(select(m.User).where(m.User.login == "admin"))
        original_id = str(user.id)
        original_hash = user.password_hash
    payload = h.export_data(str(engine().url.render_as_string(hide_password=False)))
    raw = json.dumps(payload, default=h.json_value)
    assert original_hash not in raw
    assert original_id not in raw
    assert '"password_hash"' not in raw
    assert set(payload["tables"]) == {table.name for table in h.TABLES}
    for user in payload["tables"]["users"]:
        assert user["active"] is False
        assert user["name"].startswith("Operador de teste ")
    assert h.validate_payload(json.loads(raw))


def test_snapshot_drops_free_text_and_unknown_nested_fields():
    original = str(uuid4())
    anonymous = str(uuid4())
    snapshot = {"notes": "Nome e telefone pessoais", "created_by": original,
                "updated_by": original, "unknown": {"password": str(uuid4())},
                "items": [{"code": "00001", "name": "Flor", "extra": "secret"}],
                "payments": [{"method": "pix", "applied_cents": 100, "extra": "secret"}]}
    output = h.snapshot(snapshot, {original: anonymous})
    assert output["created_by"] == anonymous
    assert output["updated_by"] == anonymous
    assert output["notes"] == ""
    assert output["items"] == [{"code": "00001", "name": "Flor"}]
    assert output["payments"] == [{"method": "pix", "applied_cents": 100}]
    assert "secret" not in json.dumps(output)


@pytest.mark.parametrize("environment,url", [
    ("production", "postgresql://pdv_owner@db/pdv_homol"),
    ("homologation", "postgresql://pdv_owner@db/pdv"),
    ("homologation", "postgresql://pdv_owner@production/pdv_homol"),
    ("homologation", "postgresql://pdv_api@db/pdv_homol"),
])
@pytest.mark.parametrize("_spec", ["@spec:AC-061 recusa destino operacional"])
def test_import_refuses_every_production_or_non_owner_target(monkeypatch, environment, url, _spec):
    monkeypatch.setenv("APP_ENV", environment)
    with pytest.raises(ValueError, match="somente"):
        h.check_target(url)


def test_import_validation_rejects_unsanitized_accounts():
    payload = json.loads(json.dumps(h.export_data(
        engine().url.render_as_string(hide_password=False)), default=h.json_value))
    for field, value in (("name", "Nome real"), ("active", True), ("password_hash", "hash")):
        altered = copy.deepcopy(payload)
        altered["tables"]["users"][0][field] = value
        with pytest.raises(ValueError):
            h.validate_payload(altered)
    payload["tables"]["sessions"] = []
    with pytest.raises(ValueError, match="tabelas"):
        h.validate_payload(payload)


@pytest.mark.parametrize("_spec", ["@spec:AC-064 faixa de homologação"])
def test_environment_banner_visible_on_receipts_and_login(tmp_path, monkeypatch, client, _spec):
    import pdv.app as module
    monkeypatch.setattr(module, "WEB_ROOT", tmp_path)
    for page in ("receipt.html", "login.html", "pdv.html"):
        (tmp_path / page).write_text("<!doctype html><html><body><main>Teste</main></body></html>")
        monkeypatch.setenv("APP_ENV", "homologation")
        response = client.get("/" + page)
        assert "HOMOLOGAÇÃO — dados de teste" in response.text
        assert 'id="environmentBanner"' in response.text
        monkeypatch.setenv("APP_ENV", "production")
        assert "environmentBanner" not in client.get("/" + page).text


@pytest.mark.parametrize("_spec", ["@spec:AC-065 SHA publicado"])
def test_health_reports_exact_deployed_sha(monkeypatch, client, _spec):
    monkeypatch.setenv("APP_ENV", "homologation")
    monkeypatch.setenv("RELEASE_SHA", "a" * 40)
    assert client.get("/api/health").json()["release_sha"] == "a" * 40
    assert client.get("/api/health").json()["environment"] == "homologation"


def historical_payload(client, clean):
    from test_api import create
    response = create(client)
    assert response.status_code == 201, response.text
    payload = json.loads(json.dumps(h.export_data(
        clean.url.render_as_string(hide_password=False)), default=h.json_value))
    assert payload["tables"]["sale_events"]
    assert "<script>" not in json.dumps(payload)
    return payload


@pytest.fixture
def isolated_import(monkeypatch, clean):
    # Exercise real SQL/transactions in the guarded disposable pdv_test database.
    # Only the target-name policy is replaced here; its production refusal is
    # tested separately, and the global connection guard remains installed.
    monkeypatch.setattr(h, "check_target", lambda url: None)
    return lambda payload: h.import_data(
        clean.url.render_as_string(hide_password=False), payload, str(uuid4()))


@pytest.mark.parametrize("_spec", ["@spec:AC-062 histórico e sequência"])
def test_import_roundtrip_preserves_history_and_resets_sequence(
        client, clean, isolated_import, _spec):
    payload = historical_payload(client, clean)
    counts = isolated_import(payload)
    assert counts == {name: len(rows) for name, rows in payload["tables"].items()}
    with clean.connect() as conn:
        for table in h.TABLES:
            expected = payload["tables"][table.name]
            actual = [dict(row) for row in conn.execute(select(table)).mappings()]
            if table.name == "users":
                historical = [row for row in actual if row["login"] != "homol-admin"]
                assert len(actual) == len(expected) + 1
                assert all(not row["active"] for row in historical)
                assert all(row["password_hash"] for row in historical)
                actual = [{key: value for key, value in row.items()
                           if key != "password_hash"} for row in historical]
            normalize = lambda rows: sorted(
                (json.loads(json.dumps(row, default=h.json_value)) for row in rows),
                key=lambda row: row["id"])
            assert normalize(actual) == normalize(expected)
        assert conn.execute(text("SELECT nextval(pg_get_serial_sequence('sales','number'))")).scalar_one() == max(
            row["number"] for row in payload["tables"]["sales"]) + 1
        for name in ("sessions", "idempotency_requests", "backup_runs", "login_attempts"):
            assert conn.execute(text(f"SELECT count(*) FROM {name}")).scalar_one() == 0


@pytest.mark.parametrize("_spec", ["@spec:AC-063 rollback integral"])
def test_failed_import_rolls_back_existing_data_and_sessions(
        client, clean, isolated_import, _spec):
    payload = historical_payload(client, clean)
    tables = (*h.TABLES, m.Session.__table__, m.IdempotencyRequest.__table__)
    with clean.connect() as conn:
        before = {table.name: list(conn.execute(select(table)).mappings()) for table in tables}
    # Fail late, after TRUNCATE and successful inserts of users/products/sales.
    payload["tables"]["sale_payments"][0]["method"] = "invalid"
    with pytest.raises(IntegrityError):
        isolated_import(payload)
    with clean.connect() as conn:
        for table in tables:
            assert list(conn.execute(select(table)).mappings()) == before[table.name]


def test_empty_import_starts_sale_numbers_at_one(clean, isolated_import):
    isolated_import({"format": 1, "tables": {table.name: [] for table in h.TABLES}})
    with clean.connect() as conn:
        assert conn.execute(text("SELECT nextval(pg_get_serial_sequence('sales','number'))")).scalar_one() == 1
