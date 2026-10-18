#!/usr/bin/env bash
# Implantação idempotente: constrói as imagens, sobe o banco, aplica as migrações e inicia a aplicação.
# Uso: scripts/deploy.sh [--no-build]
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'on_error $LINENO' ERR

BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) die "Opção desconhecida: $arg" ;;
  esac
done

fail() { warn "$1"; show_failure_help; exit 1; }

info "Verificando arquivos e configuração"
for f in docker-compose.yml Dockerfile infra/nginx/default.conf infra/postgres/init-app-user.sh; do
  [[ -f "$ROOT/$f" ]] || die "Arquivo obrigatório ausente: $f"
done
require_docker
validate_env
dc config -q || die "docker-compose.yml ou .env inválido (veja a mensagem acima)."
ok "Configuração válida."

if (( BUILD )); then
  info "Construindo imagens"
  dc build || fail "Falha ao construir as imagens."
fi

info "Iniciando PostgreSQL"
dc up -d db || fail "Falha ao iniciar o banco."
wait_healthy db 120 || fail "O banco não ficou disponível."

info "Aplicando migrações do banco"
if ! dc run --rm --no-deps migrate; then
  fail "As migrações falharam; a aplicação NÃO foi atualizada. Corrija o erro e execute novamente."
fi
ok "Migrações aplicadas."

info "Iniciando API, worker e Nginx"
dc up -d --remove-orphans || fail "Falha ao iniciar os serviços."
wait_healthy api 180 || fail "A API não ficou saudável."
wait_healthy web 90 || fail "O Nginx não ficou saudável."

info "Verificando a aplicação ponta a ponta (Nginx -> API -> banco)"
health=$(api_health_via_proxy) || fail "O endpoint /api/health não respondeu pelo proxy."
[[ "$health" == *'"status":"ok"'* ]] || fail "Resposta de saúde inesperada: $health"
ok "Saúde: $health"

port=$(env_get APP_PORT 8080)
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -o /dev/null --max-time 5 "$(local_url)/api/health"; then
    ok "Porta $port respondendo no host ($(local_url))."
  else
    warn "A aplicação está saudável, mas $(local_url) não respondeu a partir do host. Verifique conflitos de porta."
  fi
fi

if [[ "$health" == *'"has_user":false'* ]]; then
  warn "Nenhum usuário cadastrado. Crie o administrador com: $ROOT/scripts/create-admin.sh"
fi

dc ps
cat <<EOF

${C_GRN}Implantação concluída.${C_OFF}
Acesso local:   $(local_url)
Acesso remoto:  http://<IP-ou-domínio-do-servidor>:$port  (exige firewall liberado; ver README)
EOF
