#!/usr/bin/env bash
# Instalação nova: valida o ambiente, cria o .env com segredos fortes (uma única vez) e faz o deploy inicial.
# Não instala nem altera o Docker, o firewall ou a rede do sistema.
# Uso: scripts/install.sh [--port N] [--bind ENDEREÇO] [--yes]
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'on_error $LINENO' ERR

PORT="" BIND="" ASSUME_YES=0
while (( $# )); do
  case "$1" in
    --port) PORT=${2:?informe a porta}; shift 2 ;;
    --bind) BIND=${2:?informe o endereço}; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) die "Opção desconhecida: $1" ;;
  esac
done
interactive() { [[ -t 0 && $ASSUME_YES -eq 0 ]]; }

info "Verificando sistema"
[[ "$(uname -s)" == "Linux" ]] || warn "Sistema $(uname -s): os scripts foram feitos para Linux; prossiga por sua conta."
for cmd in awk grep sed; do command -v "$cmd" >/dev/null || die "Comando obrigatório ausente: $cmd"; done
require_docker
ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) e $(docker compose version --short 2>/dev/null | sed 's/^/Compose /')."

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24
  else od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; fi
}

port_in_use() {
  local p=$1
  if command -v ss >/dev/null 2>&1; then ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${p}\$"
  elif command -v lsof >/dev/null 2>&1; then lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  else return 1; fi
}

if [[ -f "$ENV_FILE" ]]; then
  ok ".env já existe: instalação anterior preservada (nenhum segredo foi regenerado)."
  [[ -z "$PORT" && -z "$BIND" ]] || warn "--port/--bind ignorados: edite APP_PORT/APP_BIND no .env para alterar."
else
  info "Criando .env a partir de .env.example"
  [[ -f "$ROOT/.env.example" ]] || die ".env.example ausente."
  umask 077
  cp "$ROOT/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  if [[ -z "$PORT" ]] && interactive; then read -rp "Porta de acesso no servidor [8080]: " PORT; fi
  PORT=${PORT:-8080}
  valid_port "$PORT" || { rm -f "$ENV_FILE"; die "Porta inválida: $PORT"; }
  if [[ -z "$BIND" ]] && interactive; then
    read -rp "Aceitar conexões de outras máquinas da rede? [S/n]: " ans
    [[ "${ans,,}" == n* ]] && BIND=127.0.0.1
  fi
  BIND=${BIND:-0.0.0.0}
  env_set APP_PORT "$PORT"
  env_set APP_BIND "$BIND"
  env_set POSTGRES_PASSWORD "$(gen_secret)"
  env_set POSTGRES_SUPERUSER_PASSWORD "$(gen_secret)"
  ok "Segredos gerados e gravados em .env (permissão 600). Guarde uma cópia do .env em local seguro."
fi

validate_env
PORT=$(env_get APP_PORT 8080)
if port_in_use "$PORT" && [[ -z "$(dc ps -q web 2>/dev/null || true)" ]]; then
  die "A porta $PORT já está em uso por outro programa. Altere APP_PORT no $ENV_FILE e execute novamente."
fi

info "Preparando diretórios"
mkdir -p "$ROOT/backups"
chmod 700 "$ROOT/backups"
chmod +x "$ROOT"/scripts/*.sh "$ROOT/infra/postgres/init-app-user.sh"

"$ROOT/scripts/deploy.sh"

if interactive; then
  read -rp "Criar o usuário administrador agora? [S/n]: " ans
  [[ "${ans,,}" == n* ]] || "$ROOT/scripts/create-admin.sh" || warn "Crie depois com scripts/create-admin.sh"
fi

cat <<EOF

Comandos de administração:
  scripts/status.sh            estado dos serviços
  scripts/logs.sh [serviço] -f logs (api, worker, web, db)
  scripts/backup.sh            backup do banco
  scripts/update.sh            atualizar a aplicação
  scripts/stop.sh              parar sem apagar dados
  scripts/create-admin.sh      criar usuário / trocar senha
EOF
if [[ "$(env_get APP_BIND)" != "127.0.0.1" ]]; then
  warn "A aplicação aceita conexões da rede na porta $PORT. Para acesso pela internet use HTTPS (ver README); sem HTTPS, restrinja ao uso em rede confiável."
fi
