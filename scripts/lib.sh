#!/usr/bin/env bash
# Funções comuns aos scripts de administração. Não execute diretamente: é carregado com `source`.

# Diretório do projeto a partir da localização deste arquivo (funciona de qualquer diretório atual).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
COMPOSE_FILE="$ROOT/docker-compose.yml"

if [[ -t 1 ]]; then
  C_RED=$'\e[31m'; C_GRN=$'\e[32m'; C_YLW=$'\e[33m'; C_BLU=$'\e[34m'; C_OFF=$'\e[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_OFF=""
fi

info() { printf '%s==>%s %s\n' "$C_BLU" "$C_OFF" "$*"; }
ok()   { printf '%s[ok]%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
warn() { printf '%s[aviso]%s %s\n' "$C_YLW" "$C_OFF" "$*" >&2; }
die()  { printf '%s[erro]%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit "${2:-1}"; }

on_error() {
  local code=$? line=${1:-?}
  printf '%s[erro]%s Falha inesperada (código %s, linha %s de %s).\n' "$C_RED" "$C_OFF" "$code" "$line" \
    "$(basename "$0")" >&2
  printf 'Diagnóstico: %s/scripts/status.sh  |  %s/scripts/logs.sh\n' "$ROOT" "$ROOT" >&2
  exit "$code"
}

dc() { docker compose --project-directory "$ROOT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker não encontrado. Instale pela documentação oficial: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || die "Plugin Docker Compose v2 não encontrado. Veja https://docs.docker.com/compose/install/linux/"
  if ! docker info >/dev/null 2>&1; then
    die "Sem acesso ao daemon do Docker. Verifique se o serviço está ativo (sudo systemctl status docker) e se seu usuário pertence ao grupo docker (ou use sudo)."
  fi
}

require_env() {
  [[ -f "$ENV_FILE" ]] || die "Arquivo .env não encontrado. Execute primeiro: $ROOT/scripts/install.sh"
}

# Lê uma variável do .env sem executar o arquivo (evita interpretar conteúdo como comando).
env_get() {
  local key=$1 default=${2:-} line
  line=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 || true)
  if [[ -z "$line" ]]; then printf '%s' "$default"; return; fi
  line=${line#*=}
  line=${line%\"}; line=${line#\"}; line=${line%\'}; line=${line#\'}
  printf '%s' "${line:-$default}"
}

# Grava/atualiza KEY=VALUE no .env preservando o restante.
env_set() {
  local key=$1 value=$2 tmp
  tmp=$(mktemp "$ROOT/.env.XXXXXX")
  if grep -qE "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 )); }

validate_env() {
  require_env
  local missing=() k
  for k in POSTGRES_PASSWORD POSTGRES_SUPERUSER_PASSWORD POSTGRES_DB POSTGRES_USER; do
    [[ -n "$(env_get "$k")" ]] || missing+=("$k")
  done
  (( ${#missing[@]} == 0 )) || die "Variáveis obrigatórias vazias no .env: ${missing[*]}"
  local port; port=$(env_get APP_PORT 8080)
  valid_port "$port" || die "APP_PORT inválida no .env: '$port' (use 1-65535)."
  local bind; bind=$(env_get APP_BIND 0.0.0.0)
  [[ "$bind" =~ ^[0-9.]+$|^\[?[0-9a-fA-F:]+\]?$ ]] || die "APP_BIND inválido no .env: '$bind'."
  local perms; perms=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo "")
  if [[ -n "$perms" && "$perms" != "600" && "$perms" != "400" ]]; then
    warn ".env com permissões $perms; recomendado 600 (chmod 600 $ENV_FILE)."
  fi
}

# Endereço local para testar a porta publicada (0.0.0.0 escuta em todas as interfaces, inclusive loopback).
local_url() {
  local bind port
  bind=$(env_get APP_BIND 0.0.0.0); port=$(env_get APP_PORT 8080)
  [[ "$bind" == "0.0.0.0" || "$bind" == "::" ]] && bind=127.0.0.1
  printf 'http://%s:%s' "$bind" "$port"
}

container_health() {
  local id; id=$(dc ps -q "$1" 2>/dev/null || true)
  [[ -n "$id" ]] || { echo "ausente"; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null \
    || echo "desconhecido"
}

wait_healthy() {
  local svc=$1 timeout=${2:-180} waited=0 state
  info "Aguardando o serviço '$svc' ficar saudável (até ${timeout}s)..."
  while (( waited < timeout )); do
    state=$(container_health "$svc")
    case "$state" in
      healthy) ok "$svc saudável."; return 0 ;;
      unhealthy|exited|dead) warn "$svc em estado '$state'."; return 1 ;;
    esac
    sleep 3; waited=$((waited + 3))
  done
  warn "Tempo esgotado aguardando '$svc' (estado atual: $(container_health "$svc"))."
  return 1
}

# Saúde real ponta a ponta: Nginx -> API -> banco + migrações (executado dentro do container web).
api_health_via_proxy() {
  dc exec -T web wget -qO- -T 5 http://127.0.0.1:8080/api/health 2>/dev/null
}

show_failure_help() {
  cat >&2 <<EOF

Para diagnosticar:
  $ROOT/scripts/status.sh
  $ROOT/scripts/logs.sh api
  $ROOT/scripts/logs.sh migrate
  $ROOT/scripts/logs.sh db
  docker compose --project-directory "$ROOT" ps -a
Nenhum dado foi apagado.
EOF
}
