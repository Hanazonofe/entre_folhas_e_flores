"""Deferred financial integrity and append-only event history."""

from alembic import op

revision = "e239_integrity"
down_revision = "d8f9e685f9ae"
branch_labels = depends_on = None


def upgrade():
    op.execute("""
    CREATE FUNCTION check_sale_balance() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE sid uuid; header sales%ROWTYPE; item_total numeric; item_count bigint; paid numeric;
    BEGIN
      IF TG_TABLE_NAME = 'sales' THEN sid := COALESCE(NEW.id, OLD.id);
      ELSE sid := COALESCE(NEW.sale_id, OLD.sale_id); END IF;
      SELECT * INTO header FROM sales WHERE id = sid;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT COALESCE(SUM(unit_price_cents::numeric * quantity),0), COUNT(*) INTO item_total,item_count FROM sale_items WHERE sale_id=sid;
      SELECT COALESCE(SUM(applied_cents),0) INTO paid FROM sale_payments WHERE sale_id=sid;
      IF item_count=0 OR item_total<>header.subtotal_cents OR paid<>header.total_cents THEN
        RAISE EXCEPTION 'Sale balance mismatch' USING ERRCODE='23514';
      END IF;
      RETURN NULL;
    END $$;
    """)
    for table in ("sales", "sale_items", "sale_payments"):
        op.execute(
            f"CREATE CONSTRAINT TRIGGER {table}_balance AFTER INSERT OR UPDATE OR DELETE ON {table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sale_balance()"
        )
    op.execute("""
    CREATE FUNCTION deny_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Event history is append-only' USING ERRCODE='42501'; END $$;
    CREATE TRIGGER immutable_sale_event BEFORE UPDATE OR DELETE ON sale_events FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
    """)


def downgrade():
    op.execute(
        "DROP TRIGGER immutable_sale_event ON sale_events; DROP FUNCTION deny_event_mutation()"
    )
    for table in ("sales", "sale_items", "sale_payments"):
        op.execute(f"DROP TRIGGER {table}_balance ON {table}")
    op.execute("DROP FUNCTION check_sale_balance()")
