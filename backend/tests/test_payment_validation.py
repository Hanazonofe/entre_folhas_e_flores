from uuid import uuid4

import pytest
from sqlalchemy import text


def sale_payload(client):
    product = client.post(
        "/api/products",
        json={"code": "PAYMENT", "name": "Payment test", "price_cents": 1000},
    ).json()
    body = {
        "items": [{"product_id": product["id"], "quantity": 1}],
        "discount_cents": 0,
    }
    quote = client.post("/api/sales/quote", json=body)
    assert quote.status_code == 200, quote.text
    return {
        **body,
        "quote_token": quote.json()["quote_token"],
        "notes": "payment validation",
    }


def create_sale(client, body):
    return client.post(
        "/api/sales",
        json=body,
        headers={"Idempotency-Key": str(uuid4())},
    )


def edit_payload(sale, payments):
    return {
        key: sale[key] for key in ("version", "items", "discount_cents", "notes")
    } | {"payments": payments}


def payment(method, applied_cents, received_cents=None):
    return {
        "method": method,
        "applied_cents": applied_cents,
        "received_cents": applied_cents if received_cents is None else received_cents,
    }


def assert_no_sale_persisted(clean):
    with clean.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM sales")) == 0
        assert db.scalar(text("SELECT count(*) FROM sale_payments")) == 0


def assert_sale_unchanged(client, sale):
    path = "/api/sales/" + sale["id"]
    assert client.get(path).json() == sale
    assert len(client.get(path + "/events").json()) == 1


@pytest.mark.parametrize(
    "_spec",
    [None],
    ids=["AC-024: meio zerado é rejeitado na criação e edição sem persistência parcial @spec:AC-024"],
)
def test_zero_payment_is_rejected_on_create_and_edit(client, clean, _spec):
    body = sale_payload(client)
    zero_payment = [payment("pix", 1000), payment("debit", 0)]
    assert create_sale(client, {**body, "payments": zero_payment}).status_code == 422
    assert_no_sale_persisted(clean)

    sale = create_sale(client, {**body, "payments": [payment("pix", 1000)]}).json()
    response = client.put(
        "/api/sales/" + sale["id"], json=edit_payload(sale, zero_payment)
    )
    assert response.status_code == 422
    assert_sale_unchanged(client, sale)


@pytest.mark.parametrize(
    "_spec",
    [None],
    ids=["AC-025: soma divergente é rejeitada na criação e edição sem persistência parcial @spec:AC-025"],
)
def test_divergent_payment_sum_is_rejected_on_create_and_edit(client, clean, _spec):
    body = sale_payload(client)
    short_payment = [payment("pix", 900)]
    assert create_sale(client, {**body, "payments": short_payment}).status_code == 422
    assert_no_sale_persisted(clean)

    sale = create_sale(client, {**body, "payments": [payment("pix", 1000)]}).json()
    response = client.put(
        "/api/sales/" + sale["id"], json=edit_payload(sale, short_payment)
    )
    assert response.status_code == 422
    assert_sale_unchanged(client, sale)


@pytest.mark.parametrize(
    "_spec",
    [None],
    ids=["AC-026: distribuição positiva com soma exata permite criar e editar a venda @spec:AC-026"],
)
def test_valid_payment_distribution_allows_sale_to_proceed(client, _spec):
    body = sale_payload(client)
    payments = [payment("pix", 600), payment("debit", 400)]
    created = create_sale(client, {**body, "payments": payments})
    assert created.status_code == 201, created.text
    sale = created.json()
    assert sale["payments"] == [
        {**row, "change_cents": 0} for row in payments
    ]

    edited_payments = [payment("cash", 500, 700), payment("credit", 500)]
    edited = client.put(
        "/api/sales/" + sale["id"], json=edit_payload(sale, edited_payments)
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["payments"] == [
        {**edited_payments[0], "change_cents": 200},
        {**edited_payments[1], "change_cents": 0},
    ]


@pytest.mark.parametrize(
    "_spec",
    [None],
    ids=["AC-031: edição administrativa rejeita pagamentos zerados e soma divergente @spec:AC-031"],
)
def test_administrative_edit_uses_the_same_payment_rules(client, _spec):
    body = sale_payload(client)
    sale = create_sale(client, {**body, "payments": [payment("pix", 1000)]}).json()
    path = "/api/sales/" + sale["id"]

    for invalid_payments in (
        [payment("pix", 1000), payment("debit", 0)],
        [payment("pix", 1100)],
    ):
        response = client.put(path, json=edit_payload(sale, invalid_payments))
        assert response.status_code == 422
        assert_sale_unchanged(client, sale)
