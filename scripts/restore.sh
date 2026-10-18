#!/usr/bin/env bash
# Restauração explícita de um backup gerado por backup.sh. SUBSTITUI todos os dados atuais.
# Uso: scripts/restore.sh ARQUIVO.dump [--yes]
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'on_error $LINENO' ERR

FILE="" ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) if [[ -z "$FILE" ]]; then FILE=$arg; else die "Argumento inesperado: $arg"; fi ;;
  esac
done
[[ -n "$FILE" ]] || die "Informe o arquivo de backup. Ex.: $0 backups/financeiro-20260101-030000.dump"
[[ -f "$FILE" && -r "$FILE" ]] || die "Arquivo não encontrado ou sem permissão de leitura: $FILE"

require_docker
validate_env
DB=$(env_get POSTGRES_DB financeiro)
APP_USER=$(env_get POSTGRES_USER financeiro_app)

info "Iniciando o banco (se necessário)"
dc up -d db
wait_healthy db 120 || die "O banco não ficou disponível."

info "Validando o arquivo"
dc exec -T db pg_restore --list < "$FILE" > /dev/null || die "Arquivo inválido: não é um backup do pg_dump em formato custom."
ok "Backup válido: $FILE ($(du -h "$FILE" | cut -f1))."

if (( ! ASSUME_YES )); then
  [[ -t 0 ]] || die "Confirmação necessária: execute em um terminal interativo ou use --yes."
  echo "${C_YLW}ATENÇÃO:${C_OFF} todos os dados atuais do banco '$DB' serão SUBSTITUÍDOS pelo conteúdo do backup."
  read -rp "Digite RESTAURAR para continuar: " answer
  [[ "$answer" == "RESTAURAR" ]] || die "Restauração cancelada. Nada foi alterado." 0
fi

info "Backup preventivo do estado atual"
if "$ROOT/scripts/backup.sh"; then ok "Estado anterior preservado em backups/."
else die "Não foi possível criar o backup preventivo; restauração cancelada."; fi

info "Parando a aplicação"
dc stop web api worker || true

info "Recriando o banco e restaurando"
dc exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v db="$DB" -v owner="$APP_USER" <<'SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db" OWNER :"owner";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
SQL
dc exec -T db psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "ALTER SCHEMA public OWNER TO \"$APP_USER\""
if ! dc exec -T db pg_restore -U postgres -d "$DB" --no-owner --role="$APP_USER" --exit-on-error < "$FILE"; then
  die "A restauração falhou. O estado anterior está no backup preventivo mais recente em backups/ (restaure-o com este script)."
fi
ok "Dados restaurados."

info "Reiniciando a aplicação (migrações aplicadas se o backup for de versão anterior)"
"$ROOT/scripts/deploy.sh" --no-build

counts=$(dc exec -T db psql -U postgres -d "$DB" -Atc \
  "SELECT (SELECT count(*) FROM accounts) || ' contas, ' || (SELECT count(*) FROM transactions) || ' lançamentos, ' || (SELECT count(*) FROM assets) || ' ativos'")
ok "Restauração concluída: $counts."
echo "Valide entrando na aplicação e conferindo saldos e patrimônio no painel."
