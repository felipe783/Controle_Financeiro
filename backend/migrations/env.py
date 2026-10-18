from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401  (registra as tabelas no metadata)
from app.config import get_settings
from app.db import Base

config = context.config
if config.config_file_name and not config.attributes.get("skip_logging"):
    from logging.config import fileConfig

    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connectable = config.attributes.get("connection")
    if connectable is None:
        url = get_settings().sqlalchemy_url
        if not isinstance(url, str):
            url = url.render_as_string(hide_password=False)
        connectable = engine_from_config({"sqlalchemy.url": url}, prefix="sqlalchemy.", poolclass=pool.NullPool)
        with connectable.connect() as connection:
            _run(connection)
    else:
        _run(connectable)


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


run_migrations_online()
