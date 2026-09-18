from pydantic import Field, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "System-112 API"
    database_url: PostgresDsn = PostgresDsn(
        "postgresql+asyncpg://trainer:trainer@localhost:15432/trainer"
    )
    sql_echo: bool = False
    jwt_secret_key: SecretStr | None = Field(default=None, min_length=32)
    jwt_issuer: str = "system112"
    jwt_audience: str = "system112-api"
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=7, ge=1, le=30)


settings = Settings()
