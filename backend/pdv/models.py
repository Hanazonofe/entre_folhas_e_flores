import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Record, Base):
    __tablename__ = "users"
    login: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint("role IN ('admin','operator')", name="user_role"),
        CheckConstraint("version > 0", name="user_version"),
    )


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int] = mapped_column(Integer, default=0)


class Session(Record, Base):
    __tablename__ = "sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(80))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Product(Record, Base):
    __tablename__ = "products"
    code: Mapped[str] = mapped_column(String(100), unique=True)
    barcode: Mapped[str | None] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(300))
    price_cents: Mapped[int] = mapped_column(BigInteger)
    stock: Mapped[float] = mapped_column(Numeric(16, 3), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint(
            "price_cents BETWEEN 0 AND 9007199254740991", name="product_price"
        ),
        CheckConstraint("version > 0", name="product_version"),
    )


class Sale(Record, Base):
    __tablename__ = "sales"
    number: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    subtotal_cents: Mapped[int] = mapped_column(BigInteger)
    discount_cents: Mapped[int] = mapped_column(BigInteger)
    total_cents: Mapped[int] = mapped_column(BigInteger)
    notes: Mapped[str] = mapped_column(Text, default="")
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    items: Mapped[list["SaleItem"]] = relationship(
        cascade="all, delete-orphan", order_by="SaleItem.position"
    )
    payments: Mapped[list["SalePayment"]] = relationship(
        cascade="all, delete-orphan", order_by="SalePayment.position"
    )
    __table_args__ = (
        CheckConstraint("status IN ('completed','cancelled')", name="sale_status"),
        CheckConstraint(
            "subtotal_cents BETWEEN 0 AND 9007199254740991 AND discount_cents BETWEEN 0 AND subtotal_cents AND total_cents = subtotal_cents - discount_cents",
            name="sale_totals",
        ),
        CheckConstraint("version > 0", name="sale_version"),
        Index("sales_date_status", "created_at", "status"),
    )


class SaleItem(Record, Base):
    __tablename__ = "sale_items"
    sale_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales.id", ondelete="RESTRICT"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT")
    )
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(300))
    code: Mapped[str] = mapped_column(String(100))
    barcode: Mapped[str | None] = mapped_column(String(100))
    unit_price_cents: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(Integer)
    __table_args__ = (
        UniqueConstraint("sale_id", "position"),
        CheckConstraint(
            "quantity > 0 AND unit_price_cents BETWEEN 0 AND 9007199254740991",
            name="item_amount",
        ),
    )


class SalePayment(Record, Base):
    __tablename__ = "sale_payments"
    sale_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))
    applied_cents: Mapped[int] = mapped_column(BigInteger)
    received_cents: Mapped[int] = mapped_column(BigInteger)
    change_cents: Mapped[int] = mapped_column(BigInteger)
    __table_args__ = (
        UniqueConstraint("sale_id", "position"),
        CheckConstraint(
            "method IN ('pix','credit','debit','cash')", name="payment_method"
        ),
        CheckConstraint(
            "applied_cents > 0 AND applied_cents <= 9007199254740991 AND received_cents BETWEEN applied_cents AND 9007199254740991 AND change_cents = received_cents - applied_cents",
            name="payment_amount",
        ),
        CheckConstraint(
            "method = 'cash' OR change_cents = 0", name="noncash_no_change"
        ),
        Index(
            "one_cash_payment",
            "sale_id",
            unique=True,
            postgresql_where=(method == "cash"),
        ),
    )


class SaleEvent(Record, Base):
    __tablename__ = "sale_events"
    sale_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales.id", ondelete="RESTRICT"), index=True
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    type: Mapped[str] = mapped_column(String(20))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        CheckConstraint(
            "type IN ('created','edited','cancelled','reactivated')", name="event_type"
        ),
    )


class IdempotencyRequest(Base):
    __tablename__ = "idempotency_requests"
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    key: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BackupRun(Record, Base):
    __tablename__ = "backup_runs"
    scheduled_date: Mapped[datetime | None] = mapped_column(Date, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checksum: Mapped[str | None] = mapped_column(String(64))
    local_path: Mapped[str | None] = mapped_column(Text)
    drive_id: Mapped[str | None] = mapped_column(String(200))
    error: Mapped[str | None] = mapped_column(Text)
    upload_uri: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','generating','pending','uploaded','failed','archived')",
            name="backup_status",
        ),
    )
