from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from pdv.db import engine


def product(c):
    r = c.post(
        "/api/products",
        json={
            "code": "X",
            "name": "<img src=x onerror=alert(1)>",
            "price_cents": 1000,
            "stock": -5,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def order(c, p=None):
    p = p or product(c)
    body = {"items": [{"product_id": p["id"], "quantity": 2}], "discount_cents": 100}
    q = c.post("/api/sales/quote", json=body)
    assert q.status_code == 200, q.text
    return {
        **body,
        "quote_token": q.json()["quote_token"],
        "notes": "<script>alert(1)</script>",
        "payments": [
            {"method": "pix", "applied_cents": 900, "received_cents": 900},
            {"method": "cash", "applied_cents": 1000, "received_cents": 2000},
        ],
    }


def create(c, body=None, key=None):
    return c.post(
        "/api/sales",
        json=body or order(c),
        headers={"Idempotency-Key": str(key or uuid4())},
    )


# @principle:P-006
def test_sale_history_transitions_and_stock(client):
    c = client
    r = create(c)
    assert r.status_code == 201, r.text
    sale = r.json()
    sid = sale["id"]
    assert sale["payments"][1]["change_cents"] == 1000
    edit = {k: sale[k] for k in ["version", "items", "discount_cents", "notes"]}
    edit["payments"] = [
        {k: v for k, v in p.items() if k != "change_cents"} for p in sale["payments"]
    ]
    edit["notes"] = "edited observation"
    r = c.put("/api/sales/" + sid, json=edit)
    assert r.status_code == 200, r.text
    assert r.json()["edited"]
    assert c.put("/api/sales/" + sid, json=edit).status_code == 409
    for version in [2, 4]:
        assert (
            c.post(f"/api/sales/{sid}/cancel", json={"version": version}).status_code
            == 200
        )
        assert c.get("/api/sales").json()["total_cents"] == 0
        assert (
            c.post(
                f"/api/sales/{sid}/cancel", json={"version": version + 1}
            ).status_code
            == 409
        )
        edit["version"] = version + 1
        assert c.put("/api/sales/" + sid, json=edit).status_code == 409
        r = c.post(f"/api/sales/{sid}/reactivate", json={"version": version + 1})
        assert r.status_code == 200
        assert r.json()["edited"]
    events = c.get(f"/api/sales/{sid}/events").json()
    assert (
        len(events) == 6 and events[0]["after"]["notes"] == "<script>alert(1)</script>"
    )
    assert events[1]["before"]["payments"] == sale["payments"]
    assert all(e["actor"] == "Admin" for e in events)
    assert c.get("/api/products").json()["items"][0]["stock"] == -5
    assert c.get("/api/sales").json()["total_cents"] == 1900


# @principle:P-006
def test_idempotency_and_price_conflict(client):
    c = client
    p = product(c)
    body = order(c, p)
    key = uuid4()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: create(c, body, key), range(2)))
    assert all(r.status_code == 201 for r in results), [r.text for r in results]
    assert results[0].json() == results[1].json()
    assert c.get("/api/sales").json()["count"] == 1
    assert create(c, {**body, "notes": "different"}, key).status_code == 409
    edited = {
        k: p[k]
        for k in [
            "code",
            "barcode",
            "name",
            "price_cents",
            "stock",
            "active",
            "version",
        ]
    }
    edited["price_cents"] = 2000
    assert c.put("/api/products/" + p["id"], json=edited).status_code == 200
    assert create(c, body).status_code == 409
    assert create(c, body, key).json() == results[0].json()


@pytest.mark.parametrize(
    "payments",
    [
        [{"method": "cash", "applied_cents": 1900, "received_cents": 1899}],
        [{"method": "pix", "applied_cents": 1900, "received_cents": 2000}],
        [
            {"method": "cash", "applied_cents": 900, "received_cents": 900},
            {"method": "cash", "applied_cents": 1000, "received_cents": 1000},
        ],
        [],
        [{"method": "debit", "applied_cents": 1901, "received_cents": 1901}],
        [{"method": "pix", "applied_cents": 1.5, "received_cents": 1.5}],
    ],
)
# @principle:P-006
# @principle:P-005
def test_invalid_payments_atomic(client, clean, payments):
    body = order(client)
    body["payments"] = payments
    assert create(client, body).status_code == 422
    with clean.connect() as db:
        for table in [
            "sales",
            "sale_items",
            "sale_payments",
            "sale_events",
            "idempotency_requests",
        ]:
            assert db.scalar(text(f"SELECT count(*) FROM {table}")) == 0


# @principle:P-005
def test_free_sale_and_discount(client):
    p = product(client)
    base = {"items": [{"product_id": p["id"], "quantity": 1}], "discount_cents": 1001}
    assert client.post("/api/sales/quote", json=base).status_code == 422
    base["discount_cents"] = 1000
    q = client.post("/api/sales/quote", json=base).json()
    assert (
        create(
            client, {**base, "quote_token": q["quote_token"], "payments": []}
        ).status_code
        == 201
    )


def test_permissions_csrf_cookie(client):
    c = client
    r = c.post(
        "/api/auth/login", json={"login": "operator", "password": "test-password-123"}
    )
    assert (
        "HttpOnly" in r.headers["set-cookie"]
        and "Secure" in r.headers["set-cookie"]
        and "SameSite=strict" in r.headers["set-cookie"]
    )
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    for path in ["/api/users", "/api/backups"]:
        assert c.get(path).status_code == 403
    assert (
        c.post(
            "/api/products", json={"code": "x", "name": "x", "price_cents": 1}
        ).status_code
        == 201
    )
    assert c.post("/api/backups", json={}).status_code == 403
    assert c.get("/api/products").status_code == 200
    assert (
        c.post(
            "/api/auth/logout", json={}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert (
        c.post(
            "/api/auth/logout", json={}, headers={"X-CSRF-Token": "wrong"}
        ).status_code
        == 403
    )
    assert c.post("/api/auth/logout", json={}).status_code == 200
    assert c.get("/api/sales").status_code == 401


# @principle:P-006
def test_database_permissions_and_constraints(client, clean):
    sale = create(client).json()
    for sql in [
        "UPDATE sale_events SET type=type",
        "DELETE FROM sale_events",
        "TRUNCATE sale_events",
    ]:
        with pytest.raises(DBAPIError), engine().begin() as db:
            db.execute(text(sql))
    with pytest.raises(DBAPIError), engine().begin() as db:
        db.execute(text("UPDATE sales SET total_cents=total_cents+1"))
    assert client.get("/api/sales/" + sale["id"]).json()["total_cents"] == 1900
    before_events = client.get("/api/sales/" + sale["id"] + "/events").json()
    # PostgreSQL 18 reports ON DELETE RESTRICT as restrict_violation (23001).
    for sql, sqlstate in [
        ("UPDATE sale_items SET unit_price_cents=unit_price_cents+1", "23514"),
        (
            "UPDATE sale_payments SET applied_cents=applied_cents-1, change_cents=change_cents+1 WHERE method='cash'",
            "23514",
        ),
        ("DELETE FROM sale_items", "23514"),
        ("DELETE FROM sale_payments", "23514"),
        ("DELETE FROM sales", "23001"),
        ("DELETE FROM products", "23001"),
        ("DELETE FROM users WHERE login='admin'", "23001"),
    ]:
        # Includes commit: the balance triggers are deferred.
        with pytest.raises(DBAPIError) as error, engine().begin() as db:
            db.execute(text(sql))
        assert error.value.orig.sqlstate == sqlstate
        assert client.get("/api/sales/" + sale["id"]).json() == sale
        assert (
            client.get("/api/sales/" + sale["id"] + "/events").json() == before_events
        )


# @principle:P-006
def test_parallel_edits(client):
    sale = create(client).json()
    path = "/api/sales/" + sale["id"] + "/cancel"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda _: client.post(path, json={"version": 1}), range(2))
        )
    assert sorted(r.status_code for r in results) == [200, 409]
    assert len(client.get("/api/sales/" + sale["id"] + "/events").json()) == 2


# @principle:P-007
def test_operator_sale_and_session_expiry(client, clean, local_only_network):
    p = product(client)
    r = client.post(
        "/api/auth/login", json={"login": "operator", "password": "test-password-123"}
    )
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    listed = client.get("/api/products")
    assert listed.status_code == 200 and listed.json()["items"][0]["id"] == p["id"]
    response = create(client, order(client, p))
    assert response.status_code == 201, response.text
    sale = response.json()
    assert client.get("/api/sales/" + sale["id"]).json() == sale
    assert sale["created_by"] == r.json()["user"]["id"]
    assert client.get("/api/sales/" + sale["id"]).status_code == 200
    assert (
        client.post(
            "/api/sales/" + sale["id"] + "/cancel", json={"version": 1}
        ).status_code
        == 403
    )
    with clean.begin() as db:
        db.execute(text("UPDATE sessions SET expires_at=now()-interval '1 second'"))
    assert client.get("/api/auth/me").status_code == 401


def test_login_limit_and_last_admin(client):
    user = client.get("/api/auth/me").json()["user"]
    assert (
        client.put(
            "/api/users/" + user["id"],
            json={"version": 1, "name": "Admin", "role": "operator", "active": True},
        ).status_code
        == 409
    )
    for _ in range(9):
        assert (
            client.post(
                "/api/auth/login", json={"login": "admin", "password": "wrong"}
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/auth/login", json={"login": "admin", "password": "test-password-123"}
        ).status_code
        == 429
    )


# @principle:P-006
def test_snapshot_and_duplicate_code(client):
    p = product(client)
    sale = create(client, order(client, p)).json()
    assert (
        client.post(
            "/api/products", json={"code": "X", "name": "duplicate", "price_cents": 1}
        ).status_code
        == 409
    )
    edit = {
        k: p[k]
        for k in [
            "code",
            "barcode",
            "name",
            "price_cents",
            "stock",
            "active",
            "version",
        ]
    }
    edit.update(name="Changed", price_cents=1, active=False)
    assert client.put("/api/products/" + p["id"], json=edit).status_code == 200
    assert client.get("/api/products?active_only=true").json()["count"] == 0
    saved = client.get("/api/sales/" + sale["id"]).json()
    assert (
        saved["items"][0]["name"] == p["name"]
        and saved["items"][0]["unit_price_cents"] == 1000
    )


# @principle:P-005
def test_persisted_money_uses_exact_integer_cents(client, clean):
    p = client.post(
        "/api/products", json={"code": "CENTS", "name": "Cents", "price_cents": 10}
    ).json()
    base = {"items": [{"product_id": p["id"], "quantity": 3}], "discount_cents": 1}
    quote = client.post("/api/sales/quote", json=base).json()
    response = create(
        client,
        {
            **base,
            "quote_token": quote["quote_token"],
            "payments": [{"method": "cash", "applied_cents": 29, "received_cents": 50}],
        },
    )
    assert response.status_code == 201, response.text
    sale = response.json()
    edit = {key: sale[key] for key in ("version", "items", "discount_cents", "notes")}
    edit["notes"] = "money snapshot after edit"
    edit["payments"] = [
        {key: value for key, value in payment.items() if key != "change_cents"}
        for payment in sale["payments"]
    ]
    updated = client.put("/api/sales/" + sale["id"], json=edit)
    assert updated.status_code == 200, updated.text
    fields = {
        "products": {"price_cents": 10},
        "sales": {"subtotal_cents": 30, "discount_cents": 1, "total_cents": 29},
        "sale_items": {"unit_price_cents": 10},
        "sale_payments": {
            "applied_cents": 29,
            "received_cents": 50,
            "change_cents": 21,
        },
    }
    with clean.connect() as db:
        types = {
            (r.table_name, r.column_name): r.data_type
            for r in db.execute(
                text(
                    "SELECT table_name, column_name, data_type FROM information_schema.columns "
                    "WHERE table_schema='public' AND right(column_name, 6)='_cents'"
                )
            )
        }
        assert set(types) == {
            (table, key) for table, values in fields.items() for key in values
        }
        assert all(kind in {"smallint", "integer", "bigint"} for kind in types.values())
        for table, values in fields.items():
            row = (
                db.execute(text(f"SELECT {', '.join(values)} FROM {table}"))
                .mappings()
                .one()
            )
            assert dict(row) == values
            assert all(type(value) is int for value in row.values())
        created = db.scalar(text("SELECT after FROM sale_events WHERE type='created'"))
        previous = db.scalar(text("SELECT before FROM sale_events WHERE type='edited'"))
        current = db.scalar(text("SELECT after FROM sale_events WHERE type='edited'"))
        repeated = db.scalar(text("SELECT result FROM idempotency_requests"))
        assert created == previous == repeated == sale
        assert current == updated.json()
        for snapshot in (created, previous, current, repeated):

            def check_money(value):
                if isinstance(value, dict):
                    for key, child in value.items():
                        if key.endswith("_cents"):
                            assert type(child) is int
                        check_money(child)
                elif isinstance(value, list):
                    for child in value:
                        check_money(child)

            check_money(snapshot)
            assert {key: snapshot[key] for key in fields["sales"]} == fields["sales"]
            assert snapshot["items"][0]["unit_price_cents"] == 10
            assert {
                key: snapshot["payments"][0][key] for key in fields["sale_payments"]
            } == fields["sale_payments"]


# @principle:P-006
def test_sale_edit_failure_rolls_back_sale_and_history(client, clean):
    from sqlalchemy import event
    from sqlalchemy.exc import IntegrityError
    from pdv.models import SaleEvent

    sale = create(client).json()
    path = "/api/sales/" + sale["id"]
    events_before = client.get(path + "/events").json()
    edit = {key: sale[key] for key in ("version", "items", "discount_cents", "notes")}
    edit["notes"] = "must roll back"
    edit["payments"] = [
        {key: value for key, value in payment.items() if key != "change_cents"}
        for payment in sale["payments"]
    ]
    observed = []

    def fail_after_event(mapper, connection, target):
        # The updated sale and its new event have already reached PostgreSQL.
        observed.append(connection.scalar(text("SELECT notes FROM sales")))
        assert connection.scalar(text("SELECT count(*) FROM sale_events")) == 2
        raise IntegrityError(
            "injected after event insert", {}, Exception("test-only failure")
        )

    event.listen(SaleEvent, "after_insert", fail_after_event)
    try:
        assert client.put(path, json=edit).status_code == 409
    finally:
        event.remove(SaleEvent, "after_insert", fail_after_event)
    assert observed == ["must roll back"]
    assert client.get(path).json() == sale
    assert client.get(path + "/events").json() == events_before
    with clean.connect() as db:
        assert db.scalar(text("SELECT result FROM idempotency_requests")) == sale
