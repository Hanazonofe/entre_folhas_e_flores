"""Resumable uploads, retry scheduling and restored backup history."""

from alembic import op
import sqlalchemy as sa

revision = "e240_backup_outbox"
down_revision = "e239_integrity"
branch_labels = depends_on = None


def upgrade():
    op.add_column("backup_runs", sa.Column("upload_uri", sa.Text(), nullable=True))
    op.add_column(
        "backup_runs",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_constraint("backup_status", "backup_runs", type_="check")
    op.create_check_constraint(
        "backup_status",
        "backup_runs",
        "status IN ('queued','generating','pending','uploaded','failed','archived')",
    )


def downgrade():
    # Refuse rather than erase restored operational metadata.
    op.drop_constraint("backup_status", "backup_runs", type_="check")
    op.create_check_constraint(
        "backup_status",
        "backup_runs",
        "status IN ('queued','generating','pending','uploaded','failed')",
    )
    op.drop_column("backup_runs", "next_attempt_at")
    op.drop_column("backup_runs", "upload_uri")
