#!/usr/bin/env bash
# Cria um usuário (a senha é digitada no terminal, nunca passada por argumento) ou troca a senha.
# Uso: scripts/create-admin.sh [USUÁRIO]            cria
#      scripts/create-admin.sh --reset USUÁRIO      troca a senha e encerra as sessões
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CMD=create-admin
if [[ "${1:-}" == "--reset" ]]; then CMD=reset-password; shift; [[ -n "${1:-}" ]] || die "Informe o usuário."; fi
[[ -t 0 ]] || die "Execute em um terminal interativo (a senha é lida sem eco)."

require_docker
require_env
[[ "$(container_health api)" == "healthy" ]] || die "A API não está em execução. Rode scripts/deploy.sh primeiro."
dc exec api python -m app.cli "$CMD" "$@"
