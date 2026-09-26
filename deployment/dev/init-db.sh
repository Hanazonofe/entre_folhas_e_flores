#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=api_password="$DEV_API_PASSWORD" \
  --set=backup_password="$DEV_BACKUP_PASSWORD" <<'SQL'
CREATE ROLE pdv_api LOGIN PASSWORD :'api_password';
CREATE ROLE pdv_backup LOGIN PASSWORD :'backup_password';
SQL
