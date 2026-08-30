"""Real dump/encryption/restore regression; called only by test-backup.sh."""

import os
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from pdv import auth, models as m, schemas as s, services as svc
from pdv.backup import generate

url = make_url(os.environ["DATABASE_URL"])
assert url.database == "pdv_test", "Disposable database required"
owner = create_engine(url)
command.upgrade(Config("/app/backend/alembic.ini"), "head")
with Session(owner) as db:
    assert not db.scalar(select(m.User.id))
    user = m.User(
        login="test-admin",
        name="Backup fixture",
        role="admin",
        password_hash=auth.hasher.hash("disposable-backup-test"),
    )
    product = m.Product(code="BACKUP", name="Test snapshot", price_cents=1000, stock=-5)
    db.add_all([user, product])
    db.flush()
    base = {
        "items": [{"product_id": str(product.id), "quantity": 2}],
        "discount_cents": 100,
    }
    quote = svc.quote(db, s.QuoteInput(**base))
    sale = svc.create_sale(
        db,
        s.SaleInput(
            **base,
            quote_token=quote["quote_token"],
            payments=[
                {"method": "pix", "applied_cents": 900, "received_cents": 900},
                {"method": "cash", "applied_cents": 1000, "received_cents": 2000},
            ],
        ),
        user,
    )
    db.commit()
with owner.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
    db.execute(text("CREATE DATABASE pdv_restore_test"))
with tempfile.TemporaryDirectory() as temporary:
    folder = Path(temporary)
    identity = folder / "test.key"
    subprocess.run(["age-keygen", "-o", str(identity)], check=True, capture_output=True)
    recipient = subprocess.check_output(
        ["age-keygen", "-y", str(identity)], text=True
    ).strip()
    archive, digest = generate(uuid4(), folder, "e240_backup_outbox", recipient)
    target = url.set(database="pdv_restore_test")
    target_file = folder / "target-url"
    target_file.write_text(target.render_as_string(hide_password=False))
    target_file.chmod(0o600)
    commandline = [
        "python",
        "-m",
        "pdv.restore",
        "--archive",
        str(archive),
        "--identity",
        str(identity),
        "--target-url-file",
        str(target_file),
        "--confirm-empty-target",
    ]
    subprocess.run(commandline, check=True)
    with Session(create_engine(target)) as db:
        restored = svc.sale_view(db.get(m.Sale, sale["id"]))
        assert restored == sale
        assert db.scalar(select(m.Product.stock)) == -5
        assert db.scalar(select(m.SaleEvent.after)) == sale
    refusal = subprocess.run(commandline, capture_output=True)
    assert refusal.returncode != 0, "Existing database must be protected"
print(
    "Real pg_dump / age / pg_restore: snapshots, history, payments and stock match; nonempty target refused."
)
