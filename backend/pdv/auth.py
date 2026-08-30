import hashlib
import secrets
from datetime import timedelta
from fastapi import Depends, HTTPException, Request
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from .db import get_db
from .models import LoginAttempt, Session, User, now

hasher = PasswordHasher()  # Argon2id default, per-password random salt.
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
COOKIE = "pdv_session"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def verify(password, password_hash):
    try:
        return hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def login_limit(db, login, address):
    """Shared persistent limits; separate transaction survives rejected login."""
    instant = now()
    for scope, limit in [(f"login:{login}", 10), (f"ip:{address}", 50)]:
        key = digest(scope)
        db.execute(
            insert(LoginAttempt)
            .values(key=key, window_start=instant, count=0)
            .on_conflict_do_nothing()
        )
        row = db.get(LoginAttempt, key, with_for_update=True)
        if instant - row.window_start >= timedelta(minutes=15):
            row.window_start, row.count = instant, 0
        if row.count >= limit:
            db.commit()
            raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos.")
        row.count += 1
    db.commit()


def principal(request: Request, db=Depends(get_db)):
    raw = request.cookies.get(COOKIE, "")
    if not raw or len(raw) > 128:
        raise HTTPException(401, "Entre no sistema.")
    session = db.scalar(
        select(Session).where(
            Session.token_hash == digest(raw),
            Session.revoked.is_(False),
            Session.expires_at > now(),
        )
    )
    user = db.get(User, session.user_id) if session else None
    if not user or not user.active:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), session.csrf_token
        ):
            raise HTTPException(403, "Token de proteção inválido. Atualize a página.")
    request.state.session = session
    return user


def admin(user=Depends(principal)):
    if user.role != "admin":
        raise HTTPException(403, "Operação permitida somente ao administrador.")
    return user


def user_view(user):
    return {
        "id": str(user.id),
        "login": user.login,
        "name": user.name,
        "role": user.role,
        "active": user.active,
        "version": user.version,
    }


def make_session(db, user):
    token = secrets.token_urlsafe(48)
    session = Session(
        user_id=user.id,
        token_hash=digest(token),
        csrf_token=secrets.token_urlsafe(32),
        expires_at=now() + timedelta(hours=8),
    )
    db.add(session)
    return token, session


def revoke_sessions(db, user_id):
    db.execute(update(Session).where(Session.user_id == user_id).values(revoked=True))


def lock_admins(db):
    # Serialize role changes so two administrators cannot remove each other at once.
    db.execute(text("SELECT pg_advisory_xact_lock(937523001)"))
