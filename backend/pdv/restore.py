"""Restore to an EMPTY isolated database only; never selects the production DB."""

import argparse
import json
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from .backup import checksum


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--identity", required=True, help="Offline age private key")
    parser.add_argument(
        "--target-url-file", required=True, help="Owner URL of a NEW isolated database"
    )
    parser.add_argument("--confirm-empty-target", action="store_true", required=True)
    args = parser.parse_args()
    url = Path(args.target_url_file).read_text().strip()
    engine = create_engine(url)
    with engine.connect() as db:
        if db.scalar(text("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'")):
            parser.error(
                "Banco de destino não está vazio. Nenhum dado foi substituído."
            )
    with tempfile.TemporaryDirectory(prefix="pdv-restore-") as tmp:
        archive = Path(tmp) / "backup.tar"
        subprocess.run(
            ["age", "--decrypt", "-i", args.identity, "-o", str(archive), args.archive],
            check=True,
            timeout=3600,
        )
        with tarfile.open(archive) as source:
            members = source.getmembers()
            if (
                {member.name for member in members}
                != {"database.dump", "manifest.json"}
                or len(members) != 2
                or any(not member.isfile() for member in members)
            ):
                raise RuntimeError("Estrutura do backup inválida.")
            source.extractall(tmp, filter="data")
        manifest = json.loads((Path(tmp) / "manifest.json").read_text())
        dump = Path(tmp) / "database.dump"
        if manifest.get("format") != 1 or checksum(dump) != manifest.get("dump_sha256"):
            raise RuntimeError("Checksum ou formato do backup inválido.")
        parsed = make_url(url)
        env = {
            **os.environ,
            "PGHOST": parsed.host or "localhost",
            "PGPORT": str(parsed.port or 5432),
            "PGUSER": parsed.username,
            "PGPASSWORD": parsed.password or "",
            "PGDATABASE": parsed.database,
        }
        subprocess.run(
            [
                "pg_restore",
                "--exit-on-error",
                "--single-transaction",
                "--no-owner",
                "--no-acl",
                "--dbname",
                parsed.database,
                str(dump),
            ],
            env=env,
            check=True,
            timeout=3600,
        )
        with engine.begin() as db:
            revision = db.scalar(text("SELECT version_num FROM alembic_version"))
            if revision != manifest["schema_revision"]:
                raise RuntimeError(
                    "Revisão restaurada diverge do manifesto. Não coloque o banco em operação."
                )
            # Sessions and machine-specific upload state must not survive recovery.
            db.execute(text("UPDATE sessions SET revoked=true"))
            db.execute(
                text(
                    "UPDATE backup_runs SET status='archived', scheduled_date=NULL, upload_uri=NULL, next_attempt_at=NULL, local_path=NULL, error='Metadados de instalação anterior; não reenviar.'"
                )
            )
            counts = {
                table: db.scalar(text(f"SELECT COUNT(*) FROM {table}"))
                for table in (
                    "users",
                    "products",
                    "sales",
                    "sale_items",
                    "sale_payments",
                    "sale_events",
                )
            }
    print(
        json.dumps(
            {
                "restored": counts,
                "schema": revision,
                "next": "Confira totais, aplique grants/migrações e faça login antes de qualquer troca operacional.",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
