"""Comandos administrativos: python -m app.cli <comando>

  create-admin [usuario]   cria um usuário (senha pedida no terminal, nunca por argumento)
  reset-password usuario   troca a senha e encerra as sessões
  check-db                 verifica conexão e versão das migrações (sai 1 se houver problema)
  status                   resumo operacional sem dados sensíveis
  worker-health            sai 0 se o worker registrou batimento nos últimos 5 minutos
"""

import datetime as dt
import getpass
import json
import sys

from sqlalchemy import func, select, text

from app import auth
from app.db import new_session
from app.models import Asset, SystemStatus, User


def _ask_password() -> str:
    p1 = getpass.getpass("Senha (mín. 12 caracteres): ")
    p2 = getpass.getpass("Confirme a senha: ")
    if p1 != p2:
        raise ValueError("As senhas não conferem.")
    return p1


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else ""
    with new_session() as db:
        try:
            if cmd == "create-admin":
                username = argv[1] if len(argv) > 1 else input("Usuário: ").strip()
                auth.create_user(db, username, _ask_password())
                print(f"Usuário '{username}' criado.")
            elif cmd == "reset-password" and len(argv) > 1:
                auth.set_password(db, argv[1], _ask_password())
                print("Senha alterada; sessões anteriores encerradas.")
            elif cmd == "check-db":
                version = db.scalar(text("SELECT version_num FROM alembic_version"))
                print(f"Banco OK; migração atual: {version}")
            elif cmd == "worker-health":
                beat = db.get(SystemStatus, "worker_heartbeat")
                age = (dt.datetime.now(dt.timezone.utc) - beat.updated_at).total_seconds() if beat else None
                if age is None or age > 300:
                    print("Worker sem batimento recente.", file=sys.stderr)
                    return 1
                print(f"Worker ativo (último batimento há {int(age)} s).")
            elif cmd == "status":
                last = db.get(SystemStatus, "quotes_last_run")
                beat = db.get(SystemStatus, "worker_heartbeat")
                print(json.dumps({
                    "usuarios": db.scalar(select(func.count()).select_from(User)),
                    "ativos": db.scalar(select(func.count()).select_from(Asset)),
                    "worker_ultimo_batimento": beat.updated_at.isoformat() if beat else None,
                    "cotacoes_ultima_execucao": last.value if last else None,
                }, ensure_ascii=False, indent=2, default=str))
            else:
                print(__doc__)
                return 2
        except ValueError as exc:
            print(f"Erro: {exc}", file=sys.stderr)
            return 1
        except Exception as exc:  # noqa: BLE001
            print(f"Erro: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
