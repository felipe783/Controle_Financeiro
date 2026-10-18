from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    app_env: str = "production"
    app_timezone: str = "America/Sao_Paulo"
    log_level: str = "INFO"

    # DATABASE_URL tem prioridade; sem ele a URL é montada a partir das partes (escapa a senha).
    database_url: str | None = None
    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "financeiro"
    postgres_user: str = "financeiro_app"
    postgres_password: str = ""

    cors_origins: str = ""
    cookie_secure: bool = False
    session_hours: int = 12
    login_max_attempts: int = 5
    login_lock_minutes: int = 15

    quotes_auto_update: bool = True
    quotes_update_interval_minutes: int = Field(60, ge=5)
    quotes_request_timeout_seconds: float = Field(15, gt=0, le=120)
    quotes_max_retries: int = Field(2, ge=0, le=5)
    quotes_min_seconds_between_requests: float = Field(1.0, ge=0)
    quotes_stale_days_listed: int = 4
    quotes_stale_days_other: int = 35
    brapi_token: str = ""
    alphavantage_api_key: str = ""
    alphavantage_daily_limit: int = 25
    fx_bcb_enabled: bool = True

    budget_alert_percent: int = 80

    @property
    def sqlalchemy_url(self) -> str | URL:
        if self.database_url:
            return self.database_url
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
