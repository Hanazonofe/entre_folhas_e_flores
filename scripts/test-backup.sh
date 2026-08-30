#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
PDV_BACKUP_TEST_CONTAINER=${PDV_BACKUP_TEST_CONTAINER:-pdv-backup-roundtrip-test}
PDV_BACKUP_TEST_PORT=${PDV_BACKUP_TEST_PORT:-55459}
PDV_BACKUP_TEST_IMAGE=${PDV_BACKUP_TEST_IMAGE:-pdv-test-backup}
if docker container inspect "$PDV_BACKUP_TEST_CONTAINER" >/dev/null 2>&1; then
 echo 'Test container exists; refusing to replace it.' >&2; exit 1
fi
docker run -d --name "$PDV_BACKUP_TEST_CONTAINER" -p "127.0.0.1:$PDV_BACKUP_TEST_PORT:5432" -e POSTGRES_PASSWORD=pdv-test-only -e POSTGRES_DB=pdv_test postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2 >/dev/null
trap 'docker rm -f "$PDV_BACKUP_TEST_CONTAINER" >/dev/null' EXIT INT TERM
n=0
until docker exec "$PDV_BACKUP_TEST_CONTAINER" pg_isready -U postgres -d pdv_test >/dev/null 2>&1; do
 n=$((n+1)); [ "$n" -lt 60 ] || exit 1; sleep 1
done
docker run --rm --network host --tmpfs /tmp -v "$PWD/backend:/app/backend:ro" -e "DATABASE_URL=postgresql+psycopg://postgres:pdv-test-only@localhost:$PDV_BACKUP_TEST_PORT/pdv_test" "$PDV_BACKUP_TEST_IMAGE" python /app/backend/tests/backup_roundtrip.py
