from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StringConstraints

Money = Annotated[int, Field(strict=True, ge=0, le=9007199254740991)]
Positive = Annotated[int, Field(strict=True, ge=1, le=1000000)]
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)
]
Login = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, pattern=r"^[a-z0-9_.-]{3,80}$"
    ),
]
Password = Annotated[str, Field(min_length=12, max_length=128)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginInput(Input):
    login: Login
    password: Annotated[str, Field(min_length=1, max_length=128)]


class PasswordInput(Input):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Password


class UserInput(Input):
    login: Login
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    role: Literal["admin", "operator"] = "operator"
    password: Password


class UserEdit(Input):
    version: Positive
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    role: Literal["admin", "operator"]
    active: bool


class ProductInput(Input):
    code: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    barcode: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None
    ) = None
    name: Name
    price_cents: Money
    stock: Annotated[FiniteFloat, Field(ge=-999999999999, le=999999999999)] = 0
    active: bool = True


class ProductEdit(ProductInput):
    version: Positive


class CartItem(Input):
    product_id: UUID
    quantity: Positive


class QuoteInput(Input):
    items: Annotated[list[CartItem], Field(min_length=1, max_length=200)]
    discount_cents: Money = 0


class PaymentInput(Input):
    method: Literal["pix", "credit", "debit", "cash"]
    applied_cents: Annotated[int, Field(strict=True, gt=0, le=9007199254740991)]
    received_cents: Money


class SaleInput(QuoteInput):
    payments: Annotated[list[PaymentInput], Field(max_length=20)]
    notes: Annotated[str, Field(max_length=10000)] = ""
    quote_token: Annotated[str, Field(min_length=64, max_length=64)]


class ItemEdit(Input):
    product_id: UUID
    name: Name
    code: Annotated[str, StringConstraints(max_length=100)]
    barcode: Annotated[str, StringConstraints(max_length=100)] | None = None
    unit_price_cents: Money
    quantity: Positive


class SaleEdit(Input):
    version: Positive
    items: Annotated[list[ItemEdit], Field(min_length=1, max_length=200)]
    discount_cents: Money
    payments: Annotated[list[PaymentInput], Field(max_length=20)]
    notes: Annotated[str, Field(max_length=10000)] = ""


class VersionInput(Input):
    version: Positive
