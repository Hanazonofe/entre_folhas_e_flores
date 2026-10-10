"""Sanitized, read-only export; guarded transactional import into pdv_homol only.

Export can be piped from a production API container without writing a raw dump.
The historical users are inactive and receive unusable random credentials.
"""

import argparse
import json
import os
import secrets
import sys
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Numeric, Uuid, create_engine, select, text
from sqlalchemy.engine import make_url
from pdv import auth, models as m
from pdv.config import database_url, secret

TABLES = (m.User.__table__, m.Product.__table__, m.Sale.__table__,
          m.SaleItem.__table__, m.SalePayment.__table__, m.SaleEvent.__table__)
SNAPSHOT_FIELDS = ("id", "number", "status", "edited", "version", "subtotal_cents",
                   "discount_cents", "total_cents", "created_at", "updated_at")
ITEM_FIELDS = ("product_id", "name", "code", "barcode", "quantity", "unit_price_cents")
PAYMENT_FIELDS = ("method", "applied_cents", "received_cents", "change_cents")


def snapshot(value, users):
    if value is None:
        return None
    result = {key: value[key] for key in SNAPSHOT_FIELDS if key in value}
    result["notes"] = ""
    for key in ("created_by", "updated_by"):
        if key in value:
            result[key] = users[str(value[key])]
    for key, fields in (("items", ITEM_FIELDS), ("payments", PAYMENT_FIELDS)):
        if key in value:
            result[key] = [{field: row[field] for field in fields if field in row}
                           for row in value[key]]
    return result


def sanitize(rows):
    users = {str(row["id"]): str(uuid4()) for row in rows["users"]}
    result = {"format": 1, "tables": {}}
    for table in TABLES:
        output = []
        for source in rows[table.name]:
            row = dict(source)
            if table.name == "users":
                index = len(output) + 1
                row.pop("password_hash", None)
                row.update(id=users[str(row["id"])], login=f"historico-{index}",
                           name=f"Operador de teste {index}", active=False)
            for field in ("created_by", "updated_by", "actor_id"):
                if field in row:
                    row[field] = users[str(row[field])]
            if table.name == "sales":
                row["notes"] = ""
            if table.name == "sale_events":
                row["before"] = snapshot(row["before"], users)
                row["after"] = snapshot(row["after"], users)
            output.append(row)
        result["tables"][table.name] = output
    return result


def export_data(url):
    # One snapshot for all tables; no database writes, passwords or raw dumps.
    with create_engine(url).connect().execution_options(
            isolation_level="REPEATABLE READ") as conn:
        with conn.begin():
            conn.execute(text("SET TRANSACTION READ ONLY"))
            rows = {}
            for table in TABLES:
                columns = [c for c in table.c if c.name != "password_hash"]
                rows[table.name] = [dict(row) for row in conn.execute(
                    select(*columns).order_by(table.c.id)).mappings()]
            return sanitize(rows)


def json_value(value):
    if isinstance(value, (UUID, datetime, Decimal)):
        return str(value)
    raise TypeError(type(value).__name__)


def validate_payload(payload):
    if set(payload) != {"format", "tables"} or payload["format"] != 1:
        raise ValueError("Formato de cópia sanitizada inválido.")
    rows = payload["tables"]
    if set(rows) != {table.name for table in TABLES}:
        raise ValueError("A cópia contém tabelas não autorizadas.")
    users = {str(row["id"]): str(row["id"]) for row in rows["users"]}
    for table in TABLES:
        expected = {c.name for c in table.c if c.name != "password_hash"}
        for row in rows[table.name]:
            if set(row) != expected:
                raise ValueError(f"Colunas não autorizadas em {table.name}.")
            if table.name == "users":
                suffix = row["login"].removeprefix("historico-")
                if (not suffix.isdigit() or row["login"] != f"historico-{suffix}"
                        or row["name"] != f"Operador de teste {suffix}"
                        or row["active"] is not False):
                    raise ValueError("Identidade não sanitizada.")
            if table.name == "sales" and row["notes"] != "":
                raise ValueError("Observações não sanitizadas.")
            if table.name == "sale_events":
                for field in ("before", "after"):
                    if row[field] != snapshot(row[field], users):
                        raise ValueError("Evento não sanitizado.")
    return rows


def check_target(url):
    target = make_url(url)
    if (os.getenv("APP_ENV") != "homologation" or target.database != "pdv_homol"
            or target.host != "db" or target.username != "pdv_owner"):
        raise ValueError("Importação permitida somente no proprietário de db/pdv_homol.")


def import_data(url, payload, password):
    check_target(url)
    rows = validate_payload(payload)
    if len(password) < 12:
        raise ValueError("A senha de homologação exige pelo menos 12 caracteres.")
    with create_engine(url).begin() as conn:
        # Owner-only operation; rollback preserves the previous sandbox on failure.
        conn.execute(text("TRUNCATE users, products, sales, backup_runs, login_attempts "
                          "RESTART IDENTITY CASCADE"))
        for table in TABLES:
            for source in rows[table.name]:
                row = dict(source)
                for column in table.c:
                    value = row.get(column.name)
                    if value is not None:
                        if isinstance(column.type, Uuid):
                            row[column.name] = UUID(str(value))
                        elif isinstance(column.type, DateTime):
                            row[column.name] = datetime.fromisoformat(str(value))
                        elif isinstance(column.type, Numeric):
                            row[column.name] = Decimal(str(value))
                if table.name == "users":
                    row["password_hash"] = auth.hasher.hash(secrets.token_urlsafe(48))
                conn.execute(table.insert().values(**row))
        conn.execute(m.User.__table__.insert().values(
            id=uuid4(), login="homol-admin", name="Administrador de homologação",
            role="admin", active=True, password_hash=auth.hasher.hash(password)))
        conn.execute(text("SELECT setval(pg_get_serial_sequence('sales','number'), "
                          "COALESCE((SELECT MAX(number) FROM sales),1), "
                          "EXISTS(SELECT 1 FROM sales))"))
    return {name: len(values) for name, values in rows.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("export", "import", "validate"))
    parser.add_argument("--confirm-replace")
    args = parser.parse_args()
    if args.action == "export":
        print(json.dumps(export_data(database_url()), default=json_value))
        return
    payload = json.load(sys.stdin)
    if args.action == "validate":
        validate_payload(payload)
        print("Cópia sanitizada validada.")
        return
    if args.confirm_replace != "pdv_homol":
        parser.error("Use --confirm-replace pdv_homol para substituir somente o sandbox.")
    counts = import_data(secret("OWNER_DATABASE_URL"), payload,
                         secret("HOMOL_ADMIN_PASSWORD"))
    print(json.dumps({"imported": counts, "admin": "homol-admin"}))


if __name__ == "__main__":
    main()
