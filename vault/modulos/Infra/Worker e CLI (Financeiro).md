# Sobre os Arquivos

## Worker (`backend/app/worker.py`)

Serviço `worker` do Compose. Segura o advisory lock `815000` numa conexão dedicada: um segundo worker fica em espera, verificando a cada 30 s. Como os dados são isolados por RLS, cada tarefa roda **para cada usuário ativo, no contexto dele** (`set_session_user`); a falha de um usuário não interrompe os outros. O ciclo roda a cada 60 s:
- grava o batimento em `system_status['worker_heartbeat']`, inclusive a cada ativo durante atualizações longas (`on_progress`);
- a cada hora, gera recorrências e registra o snapshot patrimonial do dia;
- a cada `QUOTES_UPDATE_INTERVAL_MINUTES` (se `QUOTES_AUTO_UPDATE=true`), atualiza as cotações;
- uma falha num ciclo é registrada e não derruba o processo; `SIGTERM` encerra de forma limpa.

````python
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
                quotes.update_all(db, trigger="auto", on_progress=lambda: heartbeat(db))
            except Conflict:
                log.info("atualizacao de cotacoes ja em andamento; adiada")
            last["quotes"] = now
````

## CLI (`backend/app/cli.py`)

`python -m app.cli <comando>`, usado pelos scripts dentro do container `api`:

| Comando | Uso |
|---|---|
| `create-admin [usuario]` | cria usuário; a senha é pedida com `getpass`, nunca por argumento |
| `reset-password usuario` | troca a senha e encerra as sessões |
| `check-db` | mostra a versão da migração atual |
| `status` | usuários, ativos, último batimento do worker, última atualização de cotações (sem segredos) |
| `worker-health` | sai com 0 se houve batimento nos últimos 5 minutos (healthcheck do `worker`) |


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Infra (Financeiro)|!Modulo Infra]]
