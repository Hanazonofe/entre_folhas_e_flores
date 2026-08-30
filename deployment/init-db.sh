#!/bin/sh
set -eu
PDV_API_PASSWORD="$(cat /run/secrets/api_password)"
export PDV_API_PASSWORD
PDV_BACKUP_PASSWORD="$(cat /run/secrets/backup_password)"
export PDV_BACKUP_PASSWORD
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
\getenv api_password PDV_API_PASSWORD
\getenv backup_password PDV_BACKUP_PASSWORD
CREATE ROLE pdv_api LOGIN PASSWORD :'api_password';
CREATE ROLE pdv_backup LOGIN PASSWORD :'backup_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
