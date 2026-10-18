#!/usr/bin/env bash
# Logs dos serviços. Uso: scripts/logs.sh [api|worker|web|db|migrate] [-f] [--tail N]
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SERVICE="" FOLLOW=() TAIL=200
while (( $# )); do
  case "$1" in
    -f|--follow) FOLLOW=(--follow); shift ;;
    --tail) TAIL=${2:?informe N}; shift 2 ;;
    -h|--help) sed -n '2p' "$0"; exit 0 ;;
    api|worker|web|db|migrate) SERVICE=$1; shift ;;
    *) die "Serviço ou opção desconhecida: $1 (use api, worker, web, db ou migrate)" ;;
  esac
done
[[ "$TAIL" =~ ^[0-9]+$ ]] || die "--tail deve ser um número."

require_docker
require_env
dc logs --timestamps --tail "$TAIL" "${FOLLOW[@]}" ${SERVICE:+"$SERVICE"}
