"""One-time utility on an administrator's workstation with internet/browser."""

import argparse
import os
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--client", required=True, help="Google OAuth client of type Desktop app"
    )
    parser.add_argument(
        "--output", required=True, help="New secret directory outside the repository"
    )
    args = parser.parse_args()
    destination = Path(args.output)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (destination / "drive.json").exists() or (
        destination / "drive_folder_id"
    ).exists():
        parser.error(
            "Destino já possui credenciais. Use outro diretório e confira a configuração antes de substituir."
        )
    flow = InstalledAppFlow.from_client_secrets_file(
        args.client, scopes=["https://www.googleapis.com/auth/drive.file"]
    )
    credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    if not credentials.refresh_token:
        raise RuntimeError("Autorização não forneceu token de renovação.")
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
    folder = (
        drive.files()
        .create(
            body={
                "name": "Entre Folhas e Flores — Backups",
                "mimeType": "application/vnd.google-apps.folder",
            },
            fields="id",
        )
        .execute()
    )
    for name, data in [
        ("drive.json", credentials.to_json()),
        ("drive_folder_id", folder["id"]),
    ]:
        descriptor = os.open(
            destination / name, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
        )
        with os.fdopen(descriptor, "w") as file:
            file.write(data)
    print(
        "Pasta criada e credenciais gravadas. Transfira os dois arquivos com segurança ao servidor. Não envie ao GitHub."
    )


if __name__ == "__main__":
    main()
