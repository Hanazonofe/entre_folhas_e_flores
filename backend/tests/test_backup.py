from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4
from sqlalchemy import text
from pdv import backup


def test_schedule_boundary():
    assert (
        str(backup.due_date(datetime(2026, 8, 31, 1, 59, tzinfo=timezone.utc)))
        == "2026-08-29"
    )
    assert (
        str(backup.due_date(datetime(2026, 8, 31, 2, 0, tzinfo=timezone.utc)))
        == "2026-08-30"
    )


def test_offline_outbox_retry_and_retention(clean, tmp_path, monkeypatch):
    from sqlalchemy import create_engine

    worker_engine = create_engine(
        clean.url.set(username="pdv_backup", password="pdv-backup-test-only")
    )
    # Worker intentionally has a different role from HTTP requests.
    monkeypatch.setattr(backup, "engine", lambda: worker_engine)
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path))
    calls = []

    def generate(id, *args):
        path = tmp_path / str(id)
        path.write_bytes(b"ciphertext fixture")
        calls.append(id)
        return path, backup.checksum(path)

    class Offline:
        def upload(self, *args):
            raise RuntimeError("Google Drive: HTTP 401.")

    t = datetime.now(timezone.utc)
    backup.tick(t, Offline, generate)
    with clean.connect() as db:
        row = db.execute(text("SELECT * FROM backup_runs")).mappings().one()
    assert row["status"] == "pending" and "401" in row["error"]
    backup.tick(t + timedelta(minutes=14), Offline, generate)
    assert len(calls) == 1

    class Online:
        def upload(self, run, persist):
            run.drive_id = "fixture"
            persist()

    backup.tick(t + timedelta(minutes=16), Online, generate)
    assert len(calls) == 1
    with clean.connect() as db:
        assert db.scalar(text("SELECT status FROM backup_runs")) == "uploaded"
    assert list(tmp_path.iterdir())


class Response:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self.body = body
        self.headers = headers or {}
        self.ok = status < 400

    def json(self):
        return self.body


def test_resumable_upload_and_lost_response(tmp_path):
    path = tmp_path / "backup.age"
    path.write_bytes(b"ciphertext")
    run = SimpleNamespace(
        id=uuid4(),
        local_path=str(path),
        checksum=backup.checksum(path),
        drive_id="id",
        upload_uri=None,
    )

    class Transport:
        uploaded = False

        def get(self, *args, **kwargs):
            return (
                Response(
                    200,
                    {
                        "size": str(path.stat().st_size),
                        "md5Checksum": backup.checksum(path, "md5"),
                    },
                )
                if self.uploaded
                else Response(404)
            )

        def request(self, *args, **kwargs):
            return Response(
                200, headers={"Location": "https://www.googleapis.com/upload/session"}
            )

        def put(self, *args, **kwargs):
            if kwargs.get("data"):
                assert kwargs["data"] == b"ciphertext"
                self.uploaded = True
                return Response(200)
            return Response(308)

    drive = object.__new__(backup.Drive)
    drive.folder = "folder"
    drive.session = Transport()
    saved = []
    drive.upload(run, lambda: saved.append(True))
    assert saved and run.upload_uri is None
    drive.upload(run, lambda: saved.append(True))
    assert len(saved) == 1


def test_quota_error_preserves_ciphertext(tmp_path):
    import pytest

    path = tmp_path / "backup.age"
    path.write_bytes(b"ciphertext")
    run = SimpleNamespace(
        id=uuid4(),
        local_path=str(path),
        checksum=backup.checksum(path),
        drive_id="id",
        upload_uri="https://www.googleapis.com/upload/session",
    )
    drive = object.__new__(backup.Drive)
    drive.folder = "folder"
    drive.metadata = lambda _: None
    drive.session = SimpleNamespace(put=lambda *a, **kw: Response(403))
    with pytest.raises(RuntimeError, match="403"):
        drive.upload(run, lambda: None)
    assert path.read_bytes() == b"ciphertext"


def test_retention_keeps_thirty_remote_and_never_deletes_pending(
    clean, tmp_path, monkeypatch
):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from pdv.models import BackupRun

    worker = create_engine(
        clean.url.set(username="pdv_backup", password="pdv-backup-test-only")
    )
    monkeypatch.setattr(backup, "engine", lambda: worker)
    instant = datetime.now(timezone.utc)
    paths = []
    with Session(clean) as db:
        for i in range(31):
            path = tmp_path / f"{i}.age"
            path.write_bytes(b"confirmed")
            paths.append(path)
            db.add(
                BackupRun(
                    status="uploaded",
                    local_path=str(path),
                    drive_id=str(i),
                    uploaded_at=instant - timedelta(days=8, seconds=i),
                )
            )
        pending = tmp_path / "pending.age"
        pending.write_bytes(b"pending")
        db.add(
            BackupRun(
                status="pending",
                scheduled_date=backup.due_date(instant),
                local_path=str(pending),
                checksum=backup.checksum(pending),
                next_attempt_at=instant + timedelta(hours=1),
            )
        )
        db.commit()
    deleted = []

    class Drive:
        def delete_backup(self, run):
            deleted.append(run.drive_id)

    backup.tick(instant, Drive)
    assert deleted == ["30"]
    assert not any(p.exists() for p in paths)
    assert pending.read_bytes() == b"pending"
