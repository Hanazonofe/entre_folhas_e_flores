"""Create a separate sandbox configuration; never replace existing credentials."""
import argparse
import ipaddress
import os
from pathlib import Path
import secrets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lan-ip", required=True)
    parser.add_argument("--tailnet-ip", default="100.101.186.24")
    parser.add_argument("--secrets-dir", required=True)
    parser.add_argument("--duckdns-token-file", required=True)
    parser.add_argument("--env-file", default=".env.homol-sandbox")
    args = parser.parse_args()
    lan = ipaddress.IPv4Address(args.lan_ip)
    tail = ipaddress.IPv4Address(args.tailnet_ip)
    if not lan.is_private or lan.is_loopback or tail not in ipaddress.ip_network("100.64.0.0/10"):
        parser.error("Informe um IPv4 LAN privado e um IPv4 da tailnet.")
    folder = Path(args.secrets_dir).resolve()
    env = Path(args.env_file)
    if folder.exists() or env.exists():
        parser.error("Destino existente; credenciais não serão substituídas.")
    token = Path(args.duckdns_token_file).read_text().strip()
    if not token:
        parser.error("Token DuckDNS vazio.")
    os.umask(0o077)
    folder.mkdir(mode=0o700, parents=True)
    values = {f"{role}_password": secrets.token_urlsafe(36)
              for role in ("owner", "api", "backup")}
    for role in ("owner", "api"):
        values[f"{role}_url"] = (f"postgresql+psycopg://pdv_{role}:"
                                f"{values[role + '_password']}@db:5432/pdv_homol")
    values.update(duckdns_token=token, admin_password=secrets.token_urlsafe(24))
    for name, value in values.items():
        with (folder / name).open("x") as handle:
            handle.write(value)
        # PostgreSQL reads these as its unprivileged container user.
        (folder / name).chmod(0o444 if name.endswith("_password") and name != "admin_password" else 0o600)
    with env.open("x") as handle:
        handle.write(f"HOMOL_LAN_IP={lan}\nHOMOL_TAILNET_IP={tail}\n"
                     f"HOMOL_SECRETS_DIR={folder}\n")
    print("Configuração criada. Senha inicial armazenada no secret admin_password.")


if __name__ == "__main__":
    main()
