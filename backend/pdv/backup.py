"""Local encrypted outbox. Google is required only for upload, never for sales."""

import hashlib
import json
import os
import subprocess
import tarfile
import tempfile
import time
from datetime import timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from . import __version__
from .config import database_url, secret
from .db import engine
from .models import BackupRun, now

TZ = ZoneInfo("America/Sao_Paulo")
CHUNK = 8 * 1024 * 1024


def due_date(instant):
    local = instant.astimezone(TZ)
    return local.date() if local.hour >= 23 else local.date() - timedelta(days=1)


def checksum(path, algorithm="sha256"):
    digest = hashlib.new(algorithm)
    with Path(path).open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pg_environment():
    url = make_url(database_url())
    return {
        **os.environ,
        "PGHOST": url.host or "db",
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username,
        "PGPASSWORD": url.password or "",
        "PGDATABASE": url.database,
        "PGCONNECT_TIMEOUT": "10",
    }


def generate(run_id, destination, schema_revision, recipient):
    if not recipient or not recipient.startswith("age1"):
        raise RuntimeError(
            "Configure a chave pública age do administrador antes de gerar backups."
        )
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    final = destination / f"{run_id}.tar.age"
    partial = destination / f"{run_id}.partial"
    partial.unlink(missing_ok=True)
    # /tmp is tmpfs in the backup container; plaintext never enters the backup volume.
    with tempfile.TemporaryDirectory(prefix="pdv-dump-") as temporary:
        folder = Path(temporary)
        dump = folder / "database.dump"
        subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-acl",
                "--file",
                str(dump),
            ],
            env=pg_environment(),
            check=True,
            capture_output=True,
            timeout=3600,
        )
        manifest = {
            "format": 1,
            "backup_id": str(run_id),
            "created_at": now().isoformat(),
            "app_version": __version__,
            "schema_revision": schema_revision,
            "dump_sha256": checksum(dump),
        }
        (folder / "manifest.json").write_text(json.dumps(manifest, indent=2))
        process = subprocess.Popen(
            ["age", "-r", recipient, "-o", str(partial)],
            stdin=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        try:
            with tarfile.open(fileobj=process.stdin, mode="w|") as archive:
                archive.add(dump, arcname="database.dump")
                archive.add(folder / "manifest.json", arcname="manifest.json")
            process.stdin.close()
            if process.wait(timeout=3600) != 0:
                raise RuntimeError("Criptografia do backup falhou.")
            os.chmod(partial, 0o600)
            with partial.open("rb") as file:
                os.fsync(file.fileno())
            partial.replace(final)
            directory = os.open(destination, os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        except BaseException:
            process.kill()
            process.wait()
            partial.unlink(missing_ok=True)
            raise
    return final, checksum(final)


class Drive:
    def __init__(self):
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import AuthorizedSession

        path = os.getenv("DRIVE_CREDENTIALS_FILE", "/run/secrets/drive.json")
        if not Path(path).is_file():
            raise RuntimeError(
                "Autorize o Google Drive com o utilitário administrativo."
            )
        self.session = AuthorizedSession(
            Credentials.from_authorized_user_file(
                path, ["https://www.googleapis.com/auth/drive.file"]
            )
        )
        self.folder = secret("DRIVE_FOLDER_ID")
        if not self.folder:
            raise RuntimeError("Configure a pasta exclusiva do Google Drive.")

    def request(self, method, url, **kwargs):
        response = self.session.request(method, url, timeout=60, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Google Drive: HTTP {response.status_code}. Verifique conexão, autorização e quota."
            )
        return response

    def new_id(self):
        return self.request(
            "GET",
            "https://www.googleapis.com/drive/v3/files/generateIds",
            params={"count": 1, "space": "drive", "type": "files"},
        ).json()["ids"][0]

    def metadata(self, file_id):
        response = self.session.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"fields": "id,size,md5Checksum,trashed,parents,appProperties"},
            timeout=60,
        )
        if response.status_code == 404:
            return None
        if not response.ok:
            raise RuntimeError(f"Google Drive: HTTP {response.status_code}.")
        return response.json()

    def upload(self, run, persist):
        path = Path(run.local_path)
        expected_md5, size = checksum(path, "md5"), path.stat().st_size
        if not run.drive_id:
            run.drive_id = self.new_id()
            persist()
        existing = self.metadata(run.drive_id)
        if (
            existing
            and not existing.get("trashed")
            and existing.get("md5Checksum") == expected_md5
            and int(existing.get("size", -1)) == size
        ):
            return  # Handles response loss after a completed upload.
        if existing:
            raise RuntimeError(
                "Arquivo no Drive diverge do backup local. Nenhum arquivo foi sobrescrito."
            )
        if not run.upload_uri:
            response = self.request(
                "POST",
                "https://www.googleapis.com/upload/drive/v3/files",
                params={"uploadType": "resumable"},
                json={
                    "id": run.drive_id,
                    "name": path.name,
                    "parents": [self.folder],
                    "appProperties": {
                        "pdv_backup_id": str(run.id),
                        "sha256": run.checksum,
                    },
                },
                headers={
                    "X-Upload-Content-Type": "application/octet-stream",
                    "X-Upload-Content-Length": str(size),
                },
            )
            run.upload_uri = response.headers["Location"]
            persist()
        if not run.upload_uri.startswith("https://www.googleapis.com/upload/"):
            raise RuntimeError("Endereço de envio inválido. Credencial não enviada.")
        response = self.session.put(
            run.upload_uri,
            headers={"Content-Length": "0", "Content-Range": f"bytes */{size}"},
            timeout=60,
        )
        if response.status_code in (404, 410):
            run.upload_uri = None
            persist()
            raise RuntimeError(
                "Sessão de envio expirada. Será recriada na próxima tentativa."
            )
        if response.status_code in (200, 201):
            offset = size
        elif response.status_code == 308:
            offset = (
                int(response.headers.get("Range", "bytes=0--1").rsplit("-", 1)[-1]) + 1
                if "Range" in response.headers
                else 0
            )
        else:
            raise RuntimeError(
                f"Google Drive: HTTP {response.status_code} ao retomar envio."
            )
        with path.open("rb") as file:
            file.seek(offset)
            while offset < size:
                chunk = file.read(CHUNK)
                response = self.session.put(
                    run.upload_uri,
                    data=chunk,
                    headers={
                        "Content-Length": str(len(chunk)),
                        "Content-Range": f"bytes {offset}-{offset + len(chunk) - 1}/{size}",
                    },
                    timeout=60,
                )
                if response.status_code not in (200, 201, 308):
                    raise RuntimeError(
                        f"Google Drive: HTTP {response.status_code} durante envio."
                    )
                offset += len(chunk)
        remote = self.metadata(run.drive_id)
        if (
            not remote
            or remote.get("md5Checksum") != expected_md5
            or int(remote.get("size", -1)) != size
        ):
            raise RuntimeError(
                "Verificação do arquivo enviado falhou. Cópia local preservada."
            )
        run.upload_uri = None

    def delete_backup(self, run):
        remote = self.metadata(run.drive_id)
        if remote is None:
            return
        if self.folder not in remote.get("parents", []) or remote.get(
            "appProperties", {}
        ).get("pdv_backup_id") != str(run.id):
            raise RuntimeError(
                "Retenção recusada: arquivo não pertence à pasta e ao backup esperados."
            )
        self.request(
            "DELETE", f"https://www.googleapis.com/drive/v3/files/{run.drive_id}"
        )


def safe_error(error):
    if isinstance(error, RuntimeError):
        return str(error)[:500]
    if isinstance(error, subprocess.SubprocessError):
        return "Falha ao gerar o arquivo. Verifique pg_dump, espaço temporário e chave age."
    return f"Falha de backup ({type(error).__name__}). Verifique rede, credenciais e espaço."


def tick(instant=None, drive_factory=Drive, generator=generate):
    instant = instant or now()
    # Session-level advisory lock remains held across commits and slow uploads.
    with engine().connect() as connection:
        acquired = connection.scalar(text("SELECT pg_try_advisory_lock(937523003)"))
        connection.commit()
        if not acquired:
            return
        try:
            with Session(connection) as db:
                due = due_date(instant)
                if (
                    db.scalar(select(BackupRun).where(BackupRun.scheduled_date == due))
                    is None
                ):
                    db.add(BackupRun(scheduled_date=due, status="queued"))
                    db.commit()
                rows = db.scalars(
                    select(BackupRun)
                    .where(
                        BackupRun.status.in_(
                            ["queued", "generating", "failed", "pending"]
                        )
                    )
                    .order_by(BackupRun.created_at)
                ).all()
                drive = None
                for run in rows:
                    if run.next_attempt_at and run.next_attempt_at > instant:
                        continue
                    try:
                        if run.status != "pending":
                            run.status = "generating"
                            db.commit()
                            revision = db.scalar(
                                text("SELECT version_num FROM alembic_version")
                            )
                            path, digest = generator(
                                run.id,
                                os.getenv("BACKUP_DIR", "/backups"),
                                revision,
                                secret("AGE_RECIPIENT"),
                            )
                            run.local_path, run.checksum = str(path), digest
                            run.generated_at, run.status = now(), "pending"
                            db.commit()
                        if checksum(run.local_path) != run.checksum:
                            raise RuntimeError(
                                "Checksum local inválido. Arquivo não enviado; preserve o disco para diagnóstico."
                            )
                        drive = drive or drive_factory()
                        drive.upload(run, db.commit)
                        run.status, run.uploaded_at, run.error, run.next_attempt_at = (
                            "uploaded",
                            now(),
                            None,
                            None,
                        )
                        db.commit()
                    except Exception as error:
                        db.rollback()
                        # A pending ciphertext remains pending even if OAuth or upload fails.
                        if run.status != "pending":
                            run.status = "failed"
                        run.error, run.next_attempt_at = (
                            safe_error(error),
                            instant + timedelta(minutes=15),
                        )
                        db.commit()
                confirmed = db.scalars(
                    select(BackupRun)
                    .where(BackupRun.status == "uploaded")
                    .order_by(BackupRun.uploaded_at.desc())
                ).all()
                for index, run in enumerate(confirmed):
                    try:
                        if run.local_path and run.uploaded_at < instant - timedelta(
                            days=7
                        ):
                            Path(run.local_path).unlink(missing_ok=True)
                            run.local_path = None
                        if index >= 30 and run.drive_id:
                            drive = drive or drive_factory()
                            drive.delete_backup(run)
                            run.drive_id = None
                        db.commit()
                    except Exception as error:
                        run.error = safe_error(error)
                        db.commit()
        finally:
            connection.execute(text("SELECT pg_advisory_unlock(937523003)"))
            connection.commit()


def main():
    while True:
        try:
            tick()
        except Exception as error:
            print(safe_error(error), flush=True)
        time.sleep(30)


if __name__ == "__main__":
    main()
