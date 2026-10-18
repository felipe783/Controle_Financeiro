"""Processo de tarefas programadas (serviço `worker` no Compose).

Apenas uma instância fica ativa: ela segura um advisory lock do PostgreSQL numa conexão dedicada.
Outras instâncias (ou um worker reiniciado enquanto o antigo ainda encerra) ficam em espera.
Tarefas:
- cotações e câmbio a cada QUOTES_UPDATE_INTERVAL_MINUTES (se QUOTES_AUTO_UPDATE=true);
- geração de lançamentos recorrentes e snapshot patrimonial do dia, a cada hora.
"""

import logging
import signal
import time

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.db import get_engine, new_session
from app.logging_setup import configure_logging
from app.models import SystemStatus
from app.services import ledger, networth, quotes
from app.services.common import Conflict

WORKER_LOCK_KEY = 815_000
log = logging.getLogger("app.worker")
_stop = False


def _handle_stop(*_):
    global _stop
    _stop = True


def heartbeat(db) -> None:
    stmt = pg_insert(SystemStatus).values(key="worker_heartbeat", value={"pid": 0})
    db.execute(stmt.on_conflict_do_update(index_elements=["key"], set_={"updated_at": text("now()")}))
    db.commit()


def run_once(last: dict[str, float]) -> None:
    s = get_settings()
    now = time.monotonic()
    with new_session() as db:
        heartbeat(db)
        if now - last.get("daily", -1e9) >= 3600:
            created = ledger.generate_recurrences(db)
            networth.take_snapshot(db)
            log.info("recorrencias geradas=%s; snapshot patrimonial registrado", created)
            last["daily"] = now
        if s.quotes_auto_update and now - last.get("quotes", -1e9) >= s.quotes_update_interval_minutes * 60:
            try:
                quotes.update_all(db, trigger="auto")
            except Conflict:
                log.info("atualizacao de cotacoes ja em andamento; adiada")
            last["quotes"] = now


def main() -> None:
    configure_logging(get_settings().log_level)
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    lock_conn = get_engine().connect()
    while not _stop and not lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": WORKER_LOCK_KEY}):
        lock_conn.rollback()
        log.info("outro worker esta ativo; aguardando")
        time.sleep(30)
    log.info("worker ativo")
    last: dict[str, float] = {}
    while not _stop:
        try:
            run_once(last)
        except Exception:  # noqa: BLE001 - uma falha de ciclo não derruba o worker
            log.exception("falha no ciclo do worker")
        for _ in range(60):
            if _stop:
                break
            time.sleep(1)
    lock_conn.close()
    log.info("worker encerrado")


if __name__ == "__main__":
    main()
