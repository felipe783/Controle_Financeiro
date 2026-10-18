#!/usr/bin/env bash
# Para os serviços com segurança. Não remove containers, volumes nem configuração.
# Para iniciar de novo: scripts/deploy.sh --no-build
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'on_error $LINENO' ERR

require_docker
require_env
info "Parando serviços (os dados permanecem no volume do PostgreSQL)"
dc stop
ok "Serviços parados. Para iniciar: $ROOT/scripts/deploy.sh --no-build"
