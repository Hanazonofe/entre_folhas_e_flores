"""Generate NEW local deployment credentials. Never overwrite an existing setup."""

import argparse
import os
import secrets
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument(
    "--host", required=True, help="Reserved LAN IP or local DNS name for HTTPS"
)
parser.add_argument("--directory", default="secrets")
parser.add_argument("--env-file", default=".env")
args = parser.parse_args()
if any(
    c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:"
    for c in args.host
):
    parser.error("Use um endereço local sem protocolo, caminho ou espaços.")
folder = Path(args.directory)
env_file = Path(args.env_file)
if folder.exists() or env_file.exists():
    parser.error("Destino já existe. Credenciais não serão sobrescritas.")
folder.mkdir(mode=0o700, parents=True)
(folder / "drive").mkdir(mode=0o700)
passwords = {key: secrets.token_urlsafe(36) for key in ("owner", "api", "backup")}
values = {f"{key}_password": value for key, value in passwords.items()}
values.update(
    {
        f"{key}_url": f"postgresql+psycopg://pdv_{key}:{passwords[key]}@db:5432/pdv"
        for key in passwords
    }
)
values.update({"age_recipient": "", "drive_folder_id": ""})
for name, value in values.items():
    fd = os.open(
        folder / name,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        0o444 if name.endswith("_password") else 0o600,
    )
    with os.fdopen(fd, "w") as file:
        file.write(value)
    os.chmod(folder / name, 0o444 if name.endswith("_password") else 0o600)
with env_file.open("x") as file:
    file.write(
        f"PDV_HOST={args.host}\nPUBLIC_ORIGIN=https://{args.host}\nSECRETS_DIR={folder.resolve()}\n"
    )
os.chmod(env_file, 0o600)
print(
    "Configuração criada. Gere a identidade age FORA do servidor, copie apenas o destinatário público para age_recipient e autorize o Drive antes do piloto."
)
