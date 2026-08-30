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
        == 403
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


def test_parallel_edits(client):
    sale = create(client).json()
    path = "/api/sales/" + sale["id"] + "/cancel"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda _: client.post(path, json={"version": 1}), range(2))
        )
    assert sorted(r.status_code for r in results) == [200, 409]
    assert len(client.get("/api/sales/" + sale["id"] + "/events").json()) == 2


def test_operator_sale_and_session_expiry(client, clean):
    p = product(client)
    r = client.post(
        "/api/auth/login", json={"login": "operator", "password": "test-password-123"}
    )
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    sale = create(client, order(client, p)).json()
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
