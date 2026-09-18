import hashlib
import json
from fastapi import HTTPException
from sqlalchemy import select
from .models import Product, Sale, SaleEvent, SaleItem, SalePayment, now

MAX_MONEY = 9007199254740991


def reject(condition, message, code=422):
    if not condition:
        raise HTTPException(code, message)


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def product_view(product):
    return {
        "id": str(product.id),
        "code": product.code,
        "barcode": product.barcode,
        "name": product.name,
        "price_cents": product.price_cents,
        "stock": float(product.stock),
        "active": product.active,
        "version": product.version,
    }


def calculate(items, discount):
    subtotal = sum(item["quantity"] * item["unit_price_cents"] for item in items)
    reject(subtotal <= MAX_MONEY, "O subtotal excede o limite permitido.")
    reject(discount <= subtotal, "Desconto maior que o subtotal.")
    return {
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "total_cents": subtotal - discount,
    }


def quote(db, payload):
    ids = [item.product_id for item in payload.items]
    reject(len(ids) == len(set(ids)), "Agrupe quantidades do mesmo produto.")
    # Keep current price/name stable until the sale transaction commits.
    products = {
        product.id: product
        for product in db.scalars(
            select(Product)
            .where(Product.id.in_(ids))
            .order_by(Product.id)
            .with_for_update()
        )
    }
    items = []
    versions = []
    for line in payload.items:
        product = products.get(line.product_id)
        reject(
            product is not None and product.active,
            "Produto inexistente ou inativo.",
            409,
        )
        items.append(
            {
                "product_id": str(product.id),
                "name": product.name,
                "code": product.code,
                "barcode": product.barcode,
                "quantity": line.quantity,
                "unit_price_cents": product.price_cents,
            }
        )
        versions.append(product.version)
    result = {"items": items, **calculate(items, payload.discount_cents)}
    return {**result, "quote_token": fingerprint({**result, "versions": versions})}


def payments_for(payload, total):
    rows = [line.model_dump() for line in payload]
    reject(
        sum(row["applied_cents"] for row in rows) == total,
        "A soma dos pagamentos deve ser igual ao total da venda.",
    )
    reject(
        sum(row["method"] == "cash" for row in rows) <= 1,
        "Use somente uma parcela em dinheiro.",
    )
    for row in rows:
        reject(
            row["received_cents"] >= row["applied_cents"],
            "Valor recebido em dinheiro insuficiente.",
        )
        if row["method"] != "cash":
            reject(
                row["received_cents"] == row["applied_cents"],
                "Pagamento sem dinheiro não pode ter troco.",
            )
        row["change_cents"] = row["received_cents"] - row["applied_cents"]
    return rows


def sale_view(sale):
    return {
        "id": str(sale.id),
        "number": sale.number,
        "status": sale.status,
        "edited": sale.edited,
        "version": sale.version,
        "subtotal_cents": sale.subtotal_cents,
        "discount_cents": sale.discount_cents,
        "total_cents": sale.total_cents,
        "notes": sale.notes,
        "created_at": sale.created_at.isoformat(),
        "updated_at": sale.updated_at.isoformat(),
        "created_by": str(sale.created_by),
        "updated_by": str(sale.updated_by),
        "items": [
            {
                "product_id": str(item.product_id),
                "name": item.name,
                "code": item.code,
                "barcode": item.barcode,
                "quantity": item.quantity,
                "unit_price_cents": item.unit_price_cents,
            }
            for item in sale.items
        ],
        "payments": [
            {
                "method": p.method,
                "applied_cents": p.applied_cents,
                "received_cents": p.received_cents,
                "change_cents": p.change_cents,
            }
            for p in sale.payments
        ],
    }


def event(db, sale, user, kind, before):
    db.flush()
    result = sale_view(sale)
    db.add(
        SaleEvent(
            sale_id=sale.id, actor_id=user.id, type=kind, before=before, after=result
        )
    )
    return result


def add_lines(sale, items, payments):
    sale.items = [SaleItem(position=i, **item) for i, item in enumerate(items)]
    sale.payments = [
        SalePayment(position=i, **payment) for i, payment in enumerate(payments)
    ]


def create_sale(db, payload, user):
    values = quote(db, payload)
    reject(
        payload.quote_token == values["quote_token"],
        "Os produtos mudaram. Atualize a prévia e confirme novamente.",
        409,
    )
    payments = payments_for(payload.payments, values["total_cents"])
    sale = Sale(
        created_by=user.id,
        updated_by=user.id,
        notes=payload.notes,
        **{
            key: values[key]
            for key in ("subtotal_cents", "discount_cents", "total_cents")
        },
    )
    add_lines(sale, values["items"], payments)
    db.add(sale)
    return event(db, sale, user, "created", None)


def find_sale(db, sale_id, version=None):
    statement = select(Sale).where(Sale.id == sale_id)
    if version is not None:
        statement = statement.with_for_update()
    sale = db.scalar(statement)
    reject(sale is not None, "Venda não encontrada.", 404)
    if version is not None:
        reject(
            sale.version == version,
            "A venda mudou. Reabra o registro antes de alterar.",
            409,
        )
    return sale


def edit_sale(db, sale, payload, user):
    reject(sale.status != "cancelled", "Reative a venda antes de editar.", 409)
    before = sale_view(sale)
    items = [item.model_dump() for item in payload.items]
    ids = {item["product_id"] for item in items}
    reject(len(ids) == len(items), "Agrupe quantidades do mesmo produto.")
    existing = set(db.scalars(select(Product.id).where(Product.id.in_(ids))))
    reject(existing == ids, "Produto inexistente.")
    values = calculate(items, payload.discount_cents)
    payments = payments_for(payload.payments, values["total_cents"])
    # Delete old rows before inserting replacements with the same positions.
    sale.items.clear()
    sale.payments.clear()
    db.flush()
    add_lines(sale, items, payments)
    for key, value in values.items():
        setattr(sale, key, value)
    sale.notes, sale.edited = payload.notes, True
    sale.version += 1
    sale.updated_at, sale.updated_by = now(), user.id
    return event(db, sale, user, "edited", before)


def transition(db, sale, user, cancel):
    expected = "completed" if cancel else "cancelled"
    reject(sale.status == expected, "A venda já está nessa situação.", 409)
    before = sale_view(sale)
    sale.status = "cancelled" if cancel else "completed"
    sale.version += 1
    sale.updated_at, sale.updated_by = now(), user.id
    return event(db, sale, user, "cancelled" if cancel else "reactivated", before)
