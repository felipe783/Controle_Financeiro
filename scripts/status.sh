#!/usr/bin/env bash
# Estado da instalação, sem exibir senhas ou tokens.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_env

echo "== Containers"
dc ps -a

echo
echo "== Saúde dos serviços"
for svc in db api worker web; do printf '  %-7s %s\n' "$svc" "$(container_health "$svc")"; done

echo
echo "== Porta"
echo "  APP_BIND=$(env_get APP_BIND 0.0.0.0)  APP_PORT=$(env_get APP_PORT 8080)  ->  $(local_url)"

echo
echo "== API (pelo Nginx)"
if h=$(api_health_via_proxy); then echo "  $h"; else echo "  indisponível"; fi

echo
echo "== Banco"
if dc exec -T db pg_isready -U postgres >/dev/null 2>&1; then echo "  aceitando conexões"; else echo "  indisponível"; fi

echo
echo "== Cotações e worker"
dc exec -T api python -m app.cli status 2>/dev/null | sed 's/^/  /' || echo "  (API indisponível)"

echo
echo "== Recursos"
ids=$(dc ps -q 2>/dev/null || true)
if [[ -n "$ids" ]]; then
  # shellcheck disable=SC2086
  docker stats --no-stream --format '  {{.Name}}: CPU {{.CPUPerc}}  memória {{.MemUsage}}' $ids
fi
echo "  Volume do banco: $(docker system df -v 2>/dev/null | awk '/financeiro_pgdata/ {print $NF; exit}')"

cat <<EOF

Diagnóstico:
  scripts/logs.sh api -f        logs da API em tempo real
  scripts/logs.sh worker        atualizações de cotações
  scripts/deploy.sh --no-build  reiniciar e revalidar
EOF
