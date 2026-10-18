O módulo **API** é a **camada HTTP** do backend (`backend/app/main.py`, `routers/`, `auth.py`, `schemas.py`). Ele recebe as requisições do Nginx, valida a entrada, exige sessão e delega às regras em [[!Modulo Services (Financeiro)|!Modulo Services]]. Não contém regra financeira.

Componentes:
- **[[Main (Financeiro)|Main]]**: cria o `FastAPI`, a proteção CSRF, o tratamento de erros, o `/api/health` e as rotas de login.
- **[[Routers (Financeiro)|Routers]]**: `finance.py`, `invest.py` e `planning.py`, todos com prefixo `/api` e a dependência `current_user`.
- **[[Autenticação (Financeiro)|Autenticação]]**: senha Argon2, sessão em cookie e bloqueio de tentativas.
- **Contratos (`schemas.py`)**: modelos Pydantic de entrada e saída. Valores monetários de entrada exigem no máximo 2 casas (`Field(max_digits=16, decimal_places=2)`), e textos são aparados automaticamente (`_Clean`).
- **Serialização (`serialize.py`)**: `plain()` converte `Decimal` em texto no JSON, para não perder precisão.

Erros de negócio (`DomainError`, `NotFound`, `Conflict` em `services/common.py`) viram 422, 404 e 409 com mensagem em português. Erros de validação do Pydantic viram 422 com as mensagens concatenadas.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo API (Financeiro)|!Modulo API]]
