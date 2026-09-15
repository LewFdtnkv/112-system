from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "System-112 API"
    database_url: PostgresDsn = PostgresDsn(
        "postgresql+asyncpg://trainer:trainer@localhost:15432/trainer"
    )
    sql_echo: bool = False


settings = Settings()
