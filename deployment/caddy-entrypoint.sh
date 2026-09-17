#!/bin/sh
set -eu

export DUCKDNS_API_TOKEN="$(cat /run/secrets/duckdns_token)"

exec caddy run \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
