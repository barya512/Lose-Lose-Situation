"""Application settings via pydantic-settings.

Everything here is environment-driven. Economic/formula tuning lives in
``game_config.py`` (which also reads env overrides) so playtesters can tweak
the game without touching this infrastructure config.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import quote

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Infrastructure / runtime configuration (not game economy — see game_config)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "Lose-Lose Situation"
    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = True

    # --- Database (async SQLAlchemy) ---
    # Example: postgresql+asyncpg://user:pass@host:5432/dbname
    # Render injects a bare postgresql:// connectionString; we normalize the driver below.
    database_url: str = Field(
        default="postgresql+asyncpg://loselose:loselose@localhost:5432/loselose",
    )

    # --- Message broker (RabbitMQ) ---
    # Provide either a full RABBITMQ_URL (local/compose) OR the parts (Render, where the
    # bare host comes from the private service and creds from the shared env group).
    rabbitmq_url: str | None = Field(default="amqp://guest:guest@localhost:5672/")
    rabbitmq_host: str | None = None  # e.g. "lose-lose-rabbitmq" on Render (no port)
    rabbitmq_port: int = 5672  # AMQP's standard port; not sourced from Render
    rabbitmq_user: str = "guest"
    rabbitmq_password: str = "guest"

    # --- Auth (JWT) ---
    jwt_secret: str = Field(default="dev-insecure-change-me")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days — jam-friendly long sessions

    # --- Market data provider ---
    market_provider: Literal["yfinance", "finnhub"] = "yfinance"
    finnhub_api_key: str | None = None
    market_cache_ttl_s: int = 10  # short TTL shields us from provider rate limits

    # --- CORS (frontend origin) ---
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])

    @model_validator(mode="after")
    def _normalize_connections(self) -> "Settings":
        # Render's connectionString is a bare "postgresql://"; force the async driver.
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        # When a host is provided (Render path), build the AMQP URL from parts so it
        # always wins over the localhost default that RABBITMQ_URL falls back to.
        if self.rabbitmq_host:
            # Render-generated credentials can contain URL-reserved characters
            # (e.g. "/"), which silently truncate the netloc if left raw.
            user = quote(self.rabbitmq_user, safe="")
            password = quote(self.rabbitmq_password, safe="")
            self.rabbitmq_url = (
                f"amqp://{user}:{password}@{self.rabbitmq_host}:{self.rabbitmq_port}/"
            )
        return self

    @property
    def sync_database_url(self) -> str:
        """Alembic uses a sync driver; swap asyncpg for psycopg."""
        return self.database_url.replace("+asyncpg", "+psycopg")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
