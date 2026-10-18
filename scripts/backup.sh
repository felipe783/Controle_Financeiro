#!/usr/bin/env bash
# Backup consistente do PostgreSQL com pg_dump (formato custom, compactado), com o sistema em execução.
# Uso: scripts/backup.sh [DIRETÓRIO_DESTINO]
# Retenção: BACKUP_RETENTION_DAYS (padrão 30; 0 desativa a remoção de backups antigos).
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'on_error $LINENO' ERR

DEST=${1:-$ROOT/backups}
RETENTION=${BACKUP_RETENTION_DAYS:-$(env_get BACKUP_RETENTION_DAYS 30)}
[[ "$RETENTION" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS inválido: $RETENTION"

require_docker
validate_env
[[ "$(container_health db)" == "healthy" ]] || die "O banco não está em execução/saudável. Inicie com scripts/deploy.sh."

mkdir -p "$DEST"
chmod 700 "$DEST"
DB=$(env_get POSTGRES_DB financeiro)
FILE="$DEST/financeiro-$(date +%Y%m%d-%H%M%S).dump"
TMP="$FILE.partial"
umask 077

info "Gerando backup de '$DB'"
# Conexão local no container como superusuário (sem senha em linha de comando ou log).
# --no-owner/--no-privileges permitem restaurar em outro servidor com outro usuário.
if ! dc exec -T db pg_dump -U postgres -d "$DB" -Fc --no-owner --no-privileges > "$TMP"; then
  rm -f "$TMP"
  die "pg_dump falhou."
fi
if ! dc exec -T db pg_restore --list < "$TMP" > /dev/null; then
  rm -f "$TMP"
  die "O arquivo gerado não é um backup válido (pg_restore --list falhou)."
fi
mv "$TMP" "$FILE"
chmod 600 "$FILE"
ok "Backup criado: $FILE ($(du -h "$FILE" | cut -f1))"

if (( RETENTION > 0 )); then
  mapfile -t old < <(find "$DEST" -maxdepth 1 -name 'financeiro-*.dump' -type f -mtime +"$RETENTION" | sort)
  for f in "${old[@]}"; do
    rm -f -- "$f"
    info "Retenção de $RETENTION dias: removido $(basename "$f")"
  done
fi

cat <<EOF
Lembre-se: um backup no mesmo disco não protege contra falha do disco. Copie-o para fora do servidor, ex.:
  scp usuario@servidor:$FILE .
EOF
