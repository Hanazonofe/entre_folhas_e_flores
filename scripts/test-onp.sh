#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# Separate project per invocation; never reuse or clean another environment.
PDV_ONP_PROJECT="pdv-onp-test-$$"
compose() {
  docker compose --env-file /dev/null -p "$PDV_ONP_PROJECT" -f compose.test.yaml "$@"
}
cleanup() {
  compose down -v
}

printf '%s\n' '=== JavaScript ==='
npm test

# Offline only: missing images or dependency build cache must fail, not download.
docker image inspect python:3.12-slim-bookworm >/dev/null
docker image inspect postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2 >/dev/null
trap cleanup EXIT INT TERM
printf '%s\n' '=== Python + PostgreSQL (isolated, offline) ==='
PYTEST_LOG="$(mktemp)"
if docker image inspect "${PDV_TEST_IMAGE:-entre-folhas-pdv-test-test:latest}" >/dev/null 2>&1; then
  # Sources are mounted read-only, so an existing dependency image runs THIS revision.
  if ! compose up --no-build --pull never --abort-on-container-exit --exit-code-from test >"$PYTEST_LOG" 2>&1; then
    cat "$PYTEST_LOG"
    rm -f "$PYTEST_LOG"
    exit 1
  fi
else
  if ! compose up --build --pull never --abort-on-container-exit --exit-code-from test >"$PYTEST_LOG" 2>&1; then
    cat "$PYTEST_LOG"
    rm -f "$PYTEST_LOG"
    exit 1
  fi
fi

# Keep the complete pytest log, then expose the parametrized acceptance-test
# titles as TAP.  The ONP verifier consumes TAP titles, while pytest itself
# reports them as node ids such as "...[AC-003: ... @spec:AC-003] PASSED".
cat "$PYTEST_LOG"
PYTEST_TITLES="$(sed -n -E 's/^.*\[([^]]*@spec:AC-[0-9]{3,}[^]]*)\] PASSED.*$/\1/p' "$PYTEST_LOG")"
rm -f "$PYTEST_LOG"

if [ -z "$PYTEST_TITLES" ]; then
  printf '%s\n' 'ERROR: pytest passou sem expor os títulos @spec esperados para a coleta ONP.' >&2
  exit 1
fi

PYTEST_INDEX=1
printf '%s\n' "$PYTEST_TITLES" | while IFS= read -r title; do
  printf 'ok %s - pytest: %s\n' "$PYTEST_INDEX" "$title"
  PYTEST_INDEX=$((PYTEST_INDEX + 1))
done
