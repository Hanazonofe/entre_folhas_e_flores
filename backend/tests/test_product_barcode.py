import pytest


def create_product(client, **overrides):
    response = client.post(
        "/api/products",
        json={
            "code": "00001",
            "name": "Produto de teste",
            "price_cents": 100,
            "stock": 1,
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize(
    "_title",
    [pytest.param("", id="AC-003: busca preservada fora do filtro @spec:AC-003")],
)
def test_ac_003_preserves_manual_filter_by_querying_product_code_directly(client, _title):
    filtered_out = create_product(client, code="10001", name="Copo verde")
    expected = create_product(client, code="00042", name="Vaso amarelo")

    manual_search = client.get("/api/products", params={"q": "Copo"})
    lookup = client.get("/api/products", params={"code": "00042"})

    assert manual_search.status_code == 200
    assert [item["id"] for item in manual_search.json()["items"]] == [filtered_out["id"]]
    assert lookup.status_code == 200
    assert lookup.json() == {"items": [expected], "count": 1}


@pytest.mark.parametrize(
    "_title",
    [pytest.param("", id="AC-004: produto não encontrado @spec:AC-004")],
)
def test_ac_004_returns_empty_result_for_unregistered_code_and_allows_next_lookup(
    client, _title
):
    expected = create_product(client, code="00043")

    missing = client.get("/api/products", params={"code": "99999"})
    next_lookup = client.get("/api/products", params={"code": "00043"})

    assert missing.status_code == 200
    assert missing.json() == {"items": [], "count": 0}
    assert next_lookup.status_code == 200
    assert next_lookup.json() == {"items": [expected], "count": 1}


@pytest.mark.parametrize(
    "_title",
    [pytest.param("", id="AC-006: código interno completo @spec:AC-006")],
)
def test_ac_006_matches_only_the_complete_internal_code_with_leading_zeros(
    client, _title
):
    expected = create_product(
        client,
        code="00123",
        name="Código interno alvo",
        barcode="78900123",
    )
    create_product(client, code="001234", name="Prefixo", barcode="789001234")
    create_product(client, code="78900123", name="Código igual ao EAN")

    exact = client.get("/api/products", params={"code": "00123"})
    prefix = client.get("/api/products", params={"code": "0012"})
    barcode = client.get("/api/products", params={"code": "78900123"})

    assert exact.json() == {"items": [expected], "count": 1}
    assert prefix.json() == {"items": [], "count": 0}
    assert barcode.json()["items"] != [expected]
    assert barcode.json()["items"][0]["code"] == "78900123"


@pytest.mark.parametrize(
    "_title",
    [pytest.param("", id="AC-011: produto inativo @spec:AC-011")],
)
def test_ac_011_returns_inactive_product_so_the_client_can_warn_without_adding(
    client, _title
):
    inactive = create_product(client, code="00044", active=False)

    scanner_lookup = client.get("/api/products", params={"code": "00044"})
    active_catalog = client.get(
        "/api/products", params={"code": "00044", "active_only": "true"}
    )

    assert scanner_lookup.status_code == 200
    assert scanner_lookup.json() == {"items": [inactive], "count": 1}
    assert scanner_lookup.json()["items"][0]["active"] is False
    assert active_catalog.json() == {"items": [], "count": 0}
