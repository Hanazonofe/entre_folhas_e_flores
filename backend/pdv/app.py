import os
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from . import __version__, auth, models as m, schemas as s, services as svc
from .config import public_origin
from .db import get_db

app = FastAPI(
    title="Entre Folhas e Flores — API local",
    version=__version__,
    docs_url=None,
    redoc_url=None,
)
SAFE_FILES = {
    "pdv.html",
    "vendas.html",
    "produtos.html",
    "login.html",
    "admin.html",
    "api.js",
    "payments.js",
    "pdv.js",
    "vendas.js",
    "produtos.js",
    "receipt.js",
    "receipt.html",
    "login.js",
    "admin.js",
    "ui.css",
}
WEB_ROOT = Path(os.getenv("WEB_ROOT", str(Path(__file__).resolve().parents[2])))


@app.middleware("http")
async def security(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method not in (
        "GET",
        "HEAD",
        "OPTIONS",
    ):
        if request.headers.get("origin") != public_origin():
            return JSONResponse({"detail": "Origem não autorizada."}, status_code=403)
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse({"detail": "Envie JSON."}, status_code=415)
        # Bound request bodies even for chunked requests before JSON parsing.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1_048_576:
                return JSONResponse({"detail": "Pedido muito grande."}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    )
    return response


@app.exception_handler(IntegrityError)
async def constraint_error(request, error):
    return JSONResponse(
        {
            "detail": "Dados em conflito ou inconsistentes. Atualize o registro e confira código/EAN."
        },
        status_code=409,
    )


@app.exception_handler(OperationalError)
async def database_error(request, error):
    return JSONResponse(
        {
            "detail": "Banco indisponível. Não confirme a operação; tente novamente com o mesmo pedido."
        },
        status_code=503,
    )


@app.get("/api/health")
def health(db=Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "version": __version__}


@app.post("/api/auth/login")
def login(
    payload: s.LoginInput, request: Request, response: Response, db=Depends(get_db)
):
    auth.login_limit(
        db, payload.login, request.client.host if request.client else "unknown"
    )
    user = db.scalar(select(m.User).where(m.User.login == payload.login))
    valid = auth.verify(
        payload.password, user.password_hash if user else auth.DUMMY_HASH
    )
    if not valid or not user or not user.active:
        raise HTTPException(401, "Login ou senha inválidos.")
    if auth.hasher.check_needs_rehash(user.password_hash):
        user.password_hash = auth.hasher.hash(payload.password)
    old = request.cookies.get(auth.COOKIE)
    if old:
        previous = db.scalar(
            select(m.Session).where(m.Session.token_hash == auth.digest(old))
        )
        if previous:
            previous.revoked = True
    token, session = auth.make_session(db, user)
    db.commit()
    response.set_cookie(
        auth.COOKIE,
        token,
        max_age=28800,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )
    return {"user": auth.user_view(user), "csrf_token": session.csrf_token}


@app.get("/api/auth/me")
def me(request: Request, user=Depends(auth.principal)):
    return {
        "user": auth.user_view(user),
        "csrf_token": request.state.session.csrf_token,
    }


@app.post("/api/auth/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(auth.principal),
    db=Depends(get_db),
):
    request.state.session.revoked = True
    db.commit()
    response.delete_cookie(
        auth.COOKIE, path="/", secure=True, httponly=True, samesite="strict"
    )
    return {"ok": True}


@app.post("/api/auth/password")
def password(
    payload: s.PasswordInput,
    request: Request,
    response: Response,
    user=Depends(auth.principal),
    db=Depends(get_db),
):
    auth.login_limit(
        db, user.login, request.client.host if request.client else "unknown"
    )
    if not auth.verify(payload.current_password, user.password_hash):
        raise HTTPException(403, "Senha atual inválida.")
    user.password_hash, user.updated_at = (
        auth.hasher.hash(payload.new_password),
        m.now(),
    )
    user.version += 1
    auth.revoke_sessions(db, user.id)
    db.commit()
    response.delete_cookie(
        auth.COOKIE, path="/", secure=True, httponly=True, samesite="strict"
    )
    return {"ok": True}


@app.get("/api/users")
def users(user=Depends(auth.admin), db=Depends(get_db)):
    return [
        auth.user_view(row) for row in db.scalars(select(m.User).order_by(m.User.login))
    ]


@app.post("/api/users", status_code=201)
def add_user(payload: s.UserInput, user=Depends(auth.admin), db=Depends(get_db)):
    row = m.User(
        **payload.model_dump(exclude={"password"}),
        password_hash=auth.hasher.hash(payload.password),
    )
    db.add(row)
    db.commit()
    return auth.user_view(row)


@app.put("/api/users/{user_id}")
def edit_user(
    user_id: UUID, payload: s.UserEdit, user=Depends(auth.admin), db=Depends(get_db)
):
    auth.lock_admins(db)
    row = db.get(m.User, user_id, with_for_update=True)
    svc.reject(row is not None, "Usuário não encontrado.", 404)
    svc.reject(
        row.version == payload.version, "Usuário alterado. Atualize a página.", 409
    )
    if (
        row.role == "admin"
        and row.active
        and (not payload.active or payload.role != "admin")
    ):
        count = db.scalar(
            select(func.count())
            .select_from(m.User)
            .where(m.User.role == "admin", m.User.active.is_(True))
        )
        svc.reject(count > 1, "Mantenha pelo menos um administrador ativo.", 409)
    row.name, row.role, row.active = payload.name, payload.role, payload.active
    row.version += 1
    row.updated_at = m.now()
    auth.revoke_sessions(db, row.id)
    db.commit()
    return auth.user_view(row)


@app.get("/api/products")
def products(
    active_only: bool = False,
    q: str = Query("", max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user=Depends(auth.principal),
    db=Depends(get_db),
):
    statement = select(m.Product)
    if user.role != "admin" or active_only:
        statement = statement.where(m.Product.active.is_(True))
    if q:
        statement = statement.where(
            or_(
                m.Product.name.icontains(q, autoescape=True),
                m.Product.code.icontains(q, autoescape=True),
                m.Product.barcode.icontains(q, autoescape=True),
            )
        )
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    return {
        "items": [
            svc.product_view(row)
            for row in db.scalars(
                statement.order_by(m.Product.name, m.Product.id)
                .offset(offset)
                .limit(limit)
            )
        ],
        "count": total,
    }


@app.post("/api/products", status_code=201)
def add_product(payload: s.ProductInput, user=Depends(auth.admin), db=Depends(get_db)):
    values = payload.model_dump()
    values["barcode"] = values["barcode"] or None
    row = m.Product(**values)
    db.add(row)
    db.commit()
    return svc.product_view(row)


@app.put("/api/products/{product_id}")
def edit_product(
    product_id: UUID,
    payload: s.ProductEdit,
    user=Depends(auth.admin),
    db=Depends(get_db),
):
    row = db.get(m.Product, product_id, with_for_update=True)
    svc.reject(row is not None, "Produto não encontrado.", 404)
    svc.reject(
        row.version == payload.version, "Produto alterado. Reabra a edição.", 409
    )
    for key, value in payload.model_dump(exclude={"version"}).items():
        setattr(row, key, (value or None) if key == "barcode" else value)
    row.version += 1
    row.updated_at = m.now()
    db.commit()
    return svc.product_view(row)


@app.post("/api/sales/quote")
def sales_quote(
    payload: s.QuoteInput, user=Depends(auth.principal), db=Depends(get_db)
):
    return svc.quote(db, payload)


@app.post("/api/sales", status_code=201)
def create_sale(
    payload: s.SaleInput,
    idempotency_key: UUID = Header(),
    user=Depends(auth.principal),
    db=Depends(get_db),
):
    request_hash = svc.fingerprint(payload.model_dump(mode="json"))
    lock_key = f"sale:{user.id}:{idempotency_key}"
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": lock_key},
    )
    previous = db.get(m.IdempotencyRequest, (user.id, idempotency_key))
    if previous:
        svc.reject(
            previous.request_hash == request_hash,
            "Este identificador já foi usado para outro pedido.",
            409,
        )
        return previous.result
    result = svc.create_sale(db, payload, user)
    db.add(
        m.IdempotencyRequest(
            user_id=user.id,
            key=idempotency_key,
            request_hash=request_hash,
            result=result,
        )
    )
    db.commit()
    return result


def sales_filter(q, status, day):
    filters = []
    if status == "edited":
        filters += [m.Sale.status == "completed", m.Sale.edited.is_(True)]
    elif status == "completed":
        filters += [m.Sale.status == "completed", m.Sale.edited.is_(False)]
    elif status == "cancelled":
        filters.append(m.Sale.status == "cancelled")
    if day:
        start = datetime.combine(day, time.min, ZoneInfo("America/Sao_Paulo"))
        filters += [
            m.Sale.created_at >= start,
            m.Sale.created_at < start + timedelta(days=1),
        ]
    if q:
        filters.append(
            or_(
                m.Sale.items.any(
                    or_(
                        m.SaleItem.name.icontains(q, autoescape=True),
                        m.SaleItem.code.icontains(q, autoescape=True),
                        m.SaleItem.barcode.icontains(q, autoescape=True),
                    )
                ),
                m.Sale.notes.icontains(q, autoescape=True),
                m.Sale.number.cast(m.String).icontains(q, autoescape=True),
            )
        )
    return filters


@app.get("/api/sales")
def list_sales(
    q: str = Query("", max_length=200),
    status: str = Query("all", pattern="^(all|completed|edited|cancelled)$"),
    day: date | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(auth.principal),
    db=Depends(get_db),
):
    filters = sales_filter(q, status, day)
    rows = db.scalars(
        select(m.Sale)
        .where(*filters)
        .order_by(m.Sale.created_at.desc(), m.Sale.id)
        .offset(offset)
        .limit(limit)
    ).all()
    count = db.scalar(select(func.count()).select_from(m.Sale).where(*filters))
    total = db.scalar(
        select(func.coalesce(func.sum(m.Sale.total_cents), 0)).where(
            *filters, m.Sale.status == "completed"
        )
    )
    by_method = dict(
        db.execute(
            select(m.SalePayment.method, func.sum(m.SalePayment.applied_cents))
            .join(m.Sale)
            .where(*filters, m.Sale.status == "completed")
            .group_by(m.SalePayment.method)
        ).all()
    )
    return {
        "items": [svc.sale_view(sale) for sale in rows],
        "count": count,
        "total_cents": int(total),
        "by_payment": {key: int(value) for key, value in by_method.items()},
    }


@app.get("/api/sales/{sale_id}")
def get_sale(sale_id: UUID, user=Depends(auth.principal), db=Depends(get_db)):
    return svc.sale_view(svc.find_sale(db, sale_id))


@app.put("/api/sales/{sale_id}")
def edit_sale(
    sale_id: UUID, payload: s.SaleEdit, user=Depends(auth.admin), db=Depends(get_db)
):
    result = svc.edit_sale(
        db, svc.find_sale(db, sale_id, payload.version), payload, user
    )
    db.commit()
    return result


@app.post("/api/sales/{sale_id}/cancel")
def cancel(
    sale_id: UUID, payload: s.VersionInput, user=Depends(auth.admin), db=Depends(get_db)
):
    result = svc.transition(db, svc.find_sale(db, sale_id, payload.version), user, True)
    db.commit()
    return result


@app.post("/api/sales/{sale_id}/reactivate")
def reactivate(
    sale_id: UUID, payload: s.VersionInput, user=Depends(auth.admin), db=Depends(get_db)
):
    result = svc.transition(
        db, svc.find_sale(db, sale_id, payload.version), user, False
    )
    db.commit()
    return result


@app.get("/api/sales/{sale_id}/events")
def events(sale_id: UUID, user=Depends(auth.principal), db=Depends(get_db)):
    svc.find_sale(db, sale_id)
    rows = db.execute(
        select(m.SaleEvent, m.User.name)
        .join(m.User, m.User.id == m.SaleEvent.actor_id)
        .where(m.SaleEvent.sale_id == sale_id)
        .order_by(m.SaleEvent.created_at, m.SaleEvent.id)
    )
    return [
        {
            "id": str(event.id),
            "type": event.type,
            "at": event.created_at.isoformat(),
            "actor": name,
            "actor_id": str(event.actor_id),
            "before": event.before,
            "after": event.after,
        }
        for event, name in rows
    ]


@app.get("/api/backups")
def backups(user=Depends(auth.admin), db=Depends(get_db)):
    rows = db.scalars(
        select(m.BackupRun).order_by(m.BackupRun.created_at.desc()).limit(100)
    ).all()
    generated = db.scalar(select(func.max(m.BackupRun.generated_at)))
    uploaded = db.scalar(select(func.max(m.BackupRun.uploaded_at)))
    pending = db.scalar(
        select(func.count())
        .select_from(m.BackupRun)
        .where(m.BackupRun.status.in_(["queued", "generating", "failed", "pending"]))
    )
    return {
        "last_generated": generated,
        "last_uploaded": uploaded,
        "overdue": uploaded is None or m.now() - uploaded > timedelta(hours=26),
        "pending": pending,
        "items": [
            {
                "id": str(row.id),
                "status": row.status,
                "created_at": row.created_at,
                "generated_at": row.generated_at,
                "uploaded_at": row.uploaded_at,
                "error": row.error,
            }
            for row in rows
        ],
    }


@app.post("/api/backups", status_code=202)
def request_backup(user=Depends(auth.admin), db=Depends(get_db)):
    db.execute(text("SELECT pg_advisory_xact_lock(937523002)"))
    row = db.scalar(
        select(m.BackupRun)
        .where(m.BackupRun.status.in_(["queued", "generating", "failed"]))
        .limit(1)
    )
    if row is None:
        row = m.BackupRun(status="queued")
        db.add(row)
    db.commit()
    return {"id": str(row.id), "status": row.status}


@app.get("/")
def root():
    return RedirectResponse("/pdv.html")


@app.get("/{file}")
def static_file(file: str):
    if file not in SAFE_FILES:
        raise HTTPException(404)
    return FileResponse(WEB_ROOT / file)
