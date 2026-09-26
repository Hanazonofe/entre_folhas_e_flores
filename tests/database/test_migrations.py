import os
from pathlib import Path
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text, event
from sqlalchemy.engine import Engine
from test_support import guarded_engine, install_connection_guard


# Run once on the runner's fresh database, BEFORE backend fixtures or grants.
# @principle:P-003
def test_empty_database_is_rebuilt_by_migrations():
    guard = install_connection_guard()
    owner = guarded_engine(os.environ["TEST_OWNER_URL"])
    config = Config(str(Path(__file__).resolve().parents[2] / "backend/alembic.ini"))
    try:
        with owner.connect() as db:
            assert (
                db.scalar(
                    text(
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
                    )
                )
                == 0
            )
        command.upgrade(config, "d8f9e685f9ae")
        command.upgrade(config, "head")
        command.check(config)
        with owner.connect() as db:
            assert (
                db.scalar(text("SELECT version_num FROM alembic_version"))
                == ScriptDirectory.from_config(config).get_current_head()
            )
            rows = db.execute(
                text("""
                SELECT c.relname, t.tgname, p.proname, t.tgenabled,
                       t.tgdeferrable, t.tginitdeferred, t.tgtype
                FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                JOIN pg_namespace n ON n.oid=c.relnamespace
                JOIN pg_proc p ON p.oid=t.tgfoid
                WHERE n.nspname='public' AND NOT t.tgisinternal
            """)
            ).all()
            expected = {
                (table, table + "_balance", "check_sale_balance", "O", True, True, 29)
                for table in ("sales", "sale_items", "sale_payments")
            }
            expected.add(
                (
                    "sale_events",
                    "immutable_sale_event",
                    "deny_event_mutation",
                    "O",
                    False,
                    False,
                    27,
                )
            )
            assert expected <= set(map(tuple, rows))
    finally:
        owner.dispose()
        event.remove(Engine, "do_connect", guard)
