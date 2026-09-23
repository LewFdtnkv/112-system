from pydantic import Field, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    telephony_enabled: bool = False
    ari_url: str = "http://asterisk:8088/ari"
    ari_username: str = "trainer"
    ari_password: SecretStr | None = None
    telephony_adapter_token: SecretStr | None = None
    speech_generator_token: SecretStr | None = None
    telephony_sip_domain: str = "localhost"
    telephony_ws_url: str = "/sip-ws"
    telephony_media_directory: str = "/home/appuser/telephony"
    telephony_max_call_seconds: int = Field(default=600, ge=30, le=3600)
    speech_voice: str = "ru-default"
    speech_generator_version: str = "v1"

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
    llm_base_url: str = "http://llm:11434"
    llm_model: str = "qwen3:4b-instruct-2507-q4_K_M"
    llm_timeout_seconds: int = Field(default=300, ge=10, le=1800)
    generation_poll_seconds: int = Field(default=2, ge=1, le=60)
    dadata_api_key: SecretStr | None = None
    yandex_translate_api_key: SecretStr | None = None
    yandex_cloud_folder_id: str | None = None
    external_services_timeout_seconds: int = Field(default=8, ge=1, le=30)


settings = Settings()
