#!/usr/bin/env bash
# Explicit maintenance only. No raw dump and no production writes.
set -euo pipefail
umask 077
[[ "${1:-}" == 'SUBSTITUIR-DADOS-HOMOLOGACAO' ]] || { echo 'Confirme SUBSTITUIR-DADOS-HOMOLOGACAO.' >&2; exit 1; }
cd /home/felipe/entre_folhas_homol
exec 9>/home/felipe/.entre-folhas-homol.lock
flock -n 9 || { echo 'Outra operação de homologação está em andamento.' >&2; exit 1; }
set -a
source .homol-release.env
set +a
compose=(docker compose --env-file .env.homol-sandbox -f compose.homol.yaml)
source_container=$(docker ps -q --filter label=com.docker.compose.project=entre-folhas-pdv \
  --filter label=com.docker.compose.service=api)
[[ -n "$source_container" && "$source_container" != *$'\n'* ]] || { echo 'API de produção não identificada unicamente.' >&2; exit 1; }
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT
# Only sanitized rows cross stdout; the source transaction is READ ONLY.
docker exec -i "$source_container" python - export < backend/pdv/homologation.py > "$temporary"
"${compose[@]}" run --rm --no-deps --entrypoint python seed -m pdv.homologation validate < "$temporary"
"${compose[@]}" stop web api
if "${compose[@]}" run --rm --no-deps seed --confirm-replace pdv_homol < "$temporary"; then
  "${compose[@]}" up -d --no-build --no-deps api web
else
  echo 'Importação falhou; transação revertida. Revise antes de reabrir o sandbox.' >&2
  exit 1
fi
