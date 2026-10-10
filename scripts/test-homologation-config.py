"""Validate sandbox provisioning and effective Compose without starting services."""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-db", action="store_true",
                        help="Test initial TCP readiness and migrations using pdv-test-api")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="pdv-homol-config-") as temporary:
        folder = Path(temporary)
        token = folder / "duckdns"
        token.write_text("fixture-test-only")
        config = folder / "sandbox.env"
        secrets = folder / "secrets"
        provision = ["python3", str(ROOT / "scripts/configure-homologation.py"),
                     "--lan-ip", "192.168.18.31", "--secrets-dir", str(secrets),
                     "--duckdns-token-file", str(token), "--env-file", str(config)]
        subprocess.run(provision, check=True, capture_output=True)
        original = {path.name: path.read_bytes() for path in secrets.iterdir()}
        assert secrets.stat().st_mode & 0o777 == 0o700
        assert config.stat().st_mode & 0o777 == 0o600
        repeated = subprocess.run(provision, capture_output=True)
        assert repeated.returncode != 0
        assert original == {path.name: path.read_bytes() for path in secrets.iterdir()}
        env = {**os.environ, "HOMOL_SHA": "a" * 40}
        result = subprocess.run(
            ["docker", "compose", "--env-file", str(config), "-f",
             str(ROOT / "compose.homol.yaml"), "--profile", "maintenance",
             "config", "--format", "json"], env=env, check=True,
            capture_output=True, text=True)
        effective = json.loads(result.stdout)
        assert effective["name"] == "entre-folhas-pdv-homol"
        services = effective["services"]
        assert set(services) == {"db", "migrate", "api", "web", "seed"}
        for name, service in services.items():
            assert int(service["mem_limit"]) > 0 and float(service["cpus"]) > 0
            assert "ports" not in service or name == "web"
        ports = services["web"]["ports"]
        assert {(p["host_ip"], str(p["published"]), p["target"]) for p in ports} == {
            ("192.168.18.31", "8443", 443), ("100.101.186.24", "8443", 443)}
        assert services["api"]["environment"]["APP_ENV"] == "homologation"
        assert services["api"]["environment"]["RELEASE_SHA"] == "a" * 40
        assert services["api"]["read_only"] is True
        assert services["db"]["environment"]["POSTGRES_DB"] == "pdv_homol"
        for name in ("database", "frontend"):
            assert effective["networks"][name]["internal"] is True
        assert "ingress" not in services["db"]["networks"]
        for volume in effective["volumes"].values():
            assert volume["name"].startswith("entre-folhas-pdv-homol_sandbox_")
        for secret in effective["secrets"].values():
            assert Path(secret["file"]).parent == secrets
        print("Provisionamento e isolamento efetivo do Compose: PASS")
        if args.start_db:
            subprocess.run(["docker", "image", "inspect", "pdv-test-api"],
                           check=True, capture_output=True)
            override = folder / "disposable.yaml"
            delayed_init = folder / "delayed-init.sh"
            delayed_init.write_text("#!/bin/sh\nsleep 3\n/bin/sh /test-init-db.sh\n")
            delayed_init.chmod(0o644)
            override.write_text("""services:
  db:
    volumes: !override
      - type: tmpfs
        target: /var/lib/postgresql
      - type: bind
        source: %s
        target: /docker-entrypoint-initdb.d/01-pdv.sh
        read_only: true
      - type: bind
        source: %s
        target: /test-init-db.sh
        read_only: true
  migrate:
    image: pdv-test-api
""" % (delayed_init, ROOT / "deployment/init-db.sh"))
            command = ["docker", "compose", "--env-file", str(config), "-p",
                       "pdv-homol-start-test-" + uuid4().hex[:12], "-f",
                       str(ROOT / "compose.homol.yaml"), "-f", str(override)]
            try:
                start = next(line for line in (ROOT / "scripts/deploy-homologation.sh")
                             .read_text().splitlines()
                             if line.startswith('"${compose[@]}" up ') and line.endswith(" db"))
                subprocess.run(command + shlex.split(start)[1:] + ["--pull", "never"],
                               env=env, check=True, capture_output=True)
                subprocess.run(command + ["run", "--rm", "--no-deps", "--pull",
                                          "never", "migrate"], env=env, check=True,
                               capture_output=True)
                revision = subprocess.check_output(command + ["exec", "-T", "db",
                    "psql", "-U", "pdv_owner", "-d", "pdv_homol", "-At", "-c",
                    "SELECT version_num FROM alembic_version"], env=env, text=True)
                assert revision.strip()
                print("PostgreSQL novo: readiness TCP e migrations: PASS")
            finally:
                # This unique test project uses tmpfs; never target the server sandbox.
                subprocess.run(command + ["down", "--volumes"], env=env,
                               check=True, capture_output=True)


if __name__ == "__main__":
    main()
