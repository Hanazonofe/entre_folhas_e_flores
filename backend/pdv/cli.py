"""Run locally by a server administrator. No network identity provider needed."""

import argparse
import getpass
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import auth, models as m
from .db import engine
from .schemas import UserInput, PasswordInput


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["create-admin", "reset-password"])
    parser.add_argument("login")
    args = parser.parse_args()
    password = getpass.getpass("Nova senha (mínimo 12 caracteres): ")
    if password != getpass.getpass("Repita a senha: "):
        parser.error("Senhas diferentes.")
    with Session(engine()) as db:
        auth.lock_admins(db)
        user = db.scalar(select(m.User).where(m.User.login == args.login.lower()))
        if args.command == "create-admin":
            if db.scalar(select(m.User.id).limit(1)):
                parser.error(
                    "Já existem usuários. Crie contas pela interface ou use reset-password."
                )
            values = UserInput(
                login=args.login,
                name=getpass.getuser(),
                password=password,
                role="admin",
            )
            user = m.User(
                login=values.login,
                name=values.name,
                role="admin",
                password_hash=auth.hasher.hash(password),
            )
            db.add(user)
        else:
            if not user:
                parser.error("Usuário não encontrado.")
            PasswordInput(current_password="local-recovery", new_password=password)
            user.password_hash = auth.hasher.hash(password)
            user.version += 1
            user.updated_at = m.now()
            auth.revoke_sessions(db, user.id)
        db.commit()
    print("Operação concluída. Nenhuma senha foi registrada no log.")


if __name__ == "__main__":
    main()
