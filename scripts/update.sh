#!/usr/bin/env bash
# Atualiza a aplicação sem perder dados: backup -> nova versão -> build -> migrações -> reinício -> verificação.
# Métodos suportados:
#   - Git:  scripts/update.sh            (git pull --ff-only; nunca descarta alterações locais)
#   - Cópia manual dos arquivos novos:   scripts/update.sh --no-pull
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'on_error $LINENO' ERR

PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) die "Opção desconhecida: $arg" ;;
  esac
done

require_docker
validate_env

info "Estado atual"
dc ps || true

if (( PULL )); then
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]]; then
      git -C "$ROOT" status --short --untracked-files=no
      die "Há alterações locais em arquivos versionados (acima). Faça commit ou 'git stash' antes de atualizar; nada foi alterado."
    fi
    before=$(git -C "$ROOT" rev-parse --short HEAD)
    info "Obtendo nova versão (git pull --ff-only)"
    git -C "$ROOT" pull --ff-only || die "Não foi possível atualizar sem merge (histórico divergente). Resolva manualmente."
    after=$(git -C "$ROOT" rev-parse --short HEAD)
    if [[ "$before" == "$after" ]]; then ok "Já na versão mais recente ($after)."; else ok "Atualizado de $before para $after."; fi
  else
    die "Esta instalação não é um repositório Git. Copie os arquivos da nova versão (sem sobrescrever .env e backups/) e execute: $0 --no-pull"
  fi
fi

if [[ -n "$(dc ps -q db 2>/dev/null || true)" ]]; then
  info "Backup preventivo antes das migrações"
  "$ROOT/scripts/backup.sh" || die "Backup preventivo falhou; atualização interrompida (nada foi alterado no banco)."
else
  warn "Banco não está em execução; backup preventivo ignorado (será iniciado pelo deploy)."
fi

"$ROOT/scripts/deploy.sh"
ok "Atualização concluída."
