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
if docker image inspect "${PDV_TEST_IMAGE:-entre-folhas-pdv-test-test:latest}" >/dev/null 2>&1; then
  # Sources are mounted read-only, so an existing dependency image runs THIS revision.
  compose up --no-build --pull never --abort-on-container-exit --exit-code-from test
else
  compose up --build --pull never --abort-on-container-exit --exit-code-from test
fi
