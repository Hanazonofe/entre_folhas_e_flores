"""Test-only database boundary. Never imported by the production application.

PDV_TEST_TARGET is set by the runner AFTER provisioning its disposable container.
It is an explicit host:port capability, not inferred from DATABASE_URL.
"""

import os
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url, URL, Engine
from psycopg.conninfo import conninfo_to_dict

URL_NAMES = (
    "DATABASE_URL",
    "TEST_OWNER_URL",
    "OWNER_DATABASE_URL",
    "IMPORT_TEST_DATABASE_URL",
)
PASSWORDS = {
    "postgres": "pdv-test-only",
    "pdv_api": "pdv-api-test-only",
    "pdv_backup": "pdv-backup-test-only",
}


def validate_url(value, target=None):
    target = target or os.environ.get("PDV_TEST_TARGET", "")
    try:
        host, port = target.split(":")
        url = make_url(value)
        allowed = (
            host in {"db", "localhost", "127.0.0.1"}
            and 1 <= int(port) <= 65535
            and url.drivername in {"postgresql", "postgresql+psycopg"}
            and url.host == host
            and url.port == int(port)
            and url.database in {"pdv_test", "pdv_import_test", "pdv_restore_test"}
            and url.username in PASSWORDS
            and url.password == PASSWORDS[url.username]
            and not url.query
        )
    except (ValueError, TypeError):
        allowed = False
    if not allowed:
        # Do not include the supplied URL: it could contain a real credential.
        raise RuntimeError(
            "Unauthorized test database target; use a disposable test runner"
        )
    return url


def validate_environment():
    for name in URL_NAMES:
        if os.environ.get(name + "_FILE"):
            raise RuntimeError(f"Unauthorized test database source: {name}_FILE")
        if name in os.environ:
            validate_url(os.environ[name])
    if any(name.startswith("PG") for name in os.environ):
        raise RuntimeError("Unauthorized libpq environment in database tests")


def guarded_engine(value, **kwargs):
    validate_environment()
    return create_engine(validate_url(value), **kwargs)


def install_connection_guard():
    """Guard all SQLAlchemy/psycopg connections, including application engines."""
    validate_environment()
    target = os.environ.get("PDV_TEST_TARGET", "")

    def before_connect(dialect, record, args, kwargs):
        validate_environment()
        # SQLAlchemy supplies a psycopg adaptation context, not a libpq destination option.
        connection_options = {
            key: value for key, value in kwargs.items() if key != "context"
        }
        values = conninfo_to_dict(args[0] if args else "", **connection_options)
        if set(values) - {
            "host",
            "port",
            "dbname",
            "user",
            "password",
            "connect_timeout",
        }:
            raise RuntimeError("Unauthorized test database connection options")
        validate_url(
            URL.create(
                "postgresql+psycopg",
                username=values.get("user"),
                password=values.get("password"),
                host=values.get("host"),
                port=int(values.get("port", 0)),
                database=values.get("dbname"),
            ),
            target,
        )

    event.listen(Engine, "do_connect", before_connect)
    return before_connect


if __name__ == "__main__":
    validate_environment()
