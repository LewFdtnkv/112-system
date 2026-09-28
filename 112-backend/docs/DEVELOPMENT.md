# Проверки backend

Из каталога `112-backend`, после `uv sync --locked`:

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```

Без `TEST_DATABASE_URL` интеграционные тесты пропускаются. Полный прогон требует
отдельной PostgreSQL с pgvector и применёнными миграциями. Рабочую БД не используйте:
тесты создают пользователей и учебные данные, проверяют смену паролей.

## Отдельная тестовая БД

Настройте `JWT_SECRET_KEY` в `.env` по основному README. Затем:

```sh
docker run -d --name system112-test-db -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=trainer_test -p 127.0.0.1:15433:5432 pgvector/pgvector:0.8.2-pg17-bookworm
docker exec system112-test-db pg_isready -U postgres
```

Дождитесь ответа `accepting connections` и выполните:

```sh
DATABASE_URL=postgresql+asyncpg://postgres:test-only@127.0.0.1:15433/trainer_test uv run alembic upgrade head
TEST_DATABASE_URL=postgresql+asyncpg://postgres:test-only@127.0.0.1:15433/trainer_test uv run pytest -q
DATABASE_URL=postgresql+asyncpg://postgres:test-only@127.0.0.1:15433/trainer_test uv run alembic check
```

БД должна быть без seed и ручных изменений; тесты ожидают начального администратора.
## Перед коммитом

```sh
TEST_DATABASE_URL=postgresql+asyncpg://postgres:test-only@127.0.0.1:15433/trainer_test uv run pre-commit run --all-files
```

Установленный через
`uv run pre-commit install` хук запускает проверки при коммите; для изменений кода
ему также нужен `TEST_DATABASE_URL`. Зависимости меняйте через `uv add`, сохраняйте
`pyproject.toml` и `uv.lock` вместе. TTS-зависимости находятся в группе `tts`.

## Завершение

После проверки удалите тестовый контейнер и его том:

```sh
docker rm -f -v system112-test-db
```

[Архитектура](BACKEND_ARCHITECTURE.md) · [Нагрузочные тесты](../performance/README.md)
