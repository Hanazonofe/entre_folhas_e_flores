#!/bin/sh
# Creates and removes ONLY a dedicated disposable test container/database.
set -eu
cd "$(dirname "$0")/.."
PYTHON=${PYTHON:-python3}
PDV_TEST_CONTAINER=${PDV_TEST_CONTAINER:-pdv-automated-tests}
PDV_TEST_PORT=${PDV_TEST_PORT:-55449}
if docker container inspect "$PDV_TEST_CONTAINER" >/dev/null 2>&1; then
  echo 'Test container already exists; refusing to replace it.' >&2
  exit 1
fi
docker run -d --name "$PDV_TEST_CONTAINER" -p "127.0.0.1:$PDV_TEST_PORT:5432" -e POSTGRES_PASSWORD=pdv-test-only -e POSTGRES_DB=pdv_test postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2 >/dev/null
trap 'docker rm -f "$PDV_TEST_CONTAINER" >/dev/null' EXIT INT TERM
n=0
until docker exec "$PDV_TEST_CONTAINER" pg_isready -U postgres -d pdv_test >/dev/null 2>&1; do
  n=$((n+1)); [ "$n" -lt 60 ] || exit 1
  sleep 1
done
export PYTHONPATH=backend
export TEST_OWNER_URL="postgresql+psycopg://postgres:pdv-test-only@localhost:$PDV_TEST_PORT/pdv_test"
export DATABASE_URL="$TEST_OWNER_URL"
"$PYTHON" -m alembic -c backend/alembic.ini upgrade d8f9e685f9ae
"$PYTHON" -m alembic -c backend/alembic.ini upgrade head
"$PYTHON" -m alembic -c backend/alembic.ini check
docker exec -i "$PDV_TEST_CONTAINER" psql -U postgres -d pdv_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE pdv_api LOGIN PASSWORD 'pdv-api-test-only';
CREATE ROLE pdv_backup LOGIN PASSWORD 'pdv-backup-test-only';
SQL
docker exec -i "$PDV_TEST_CONTAINER" psql -U postgres -d pdv_test -v ON_ERROR_STOP=1 < deployment/grants.sql
export DATABASE_URL="postgresql+psycopg://pdv_api:pdv-api-test-only@localhost:$PDV_TEST_PORT/pdv_test"
"$PYTHON" -m pytest backend/tests -q
