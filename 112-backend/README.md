# Тренажёр 112/ДДС · Backend

API учебного тренажёра: пользователи, карточки и сценарии, занятия, оценивание и отчёты. Фоновые воркеры выполняют ИИ-задачи, готовят озвучку и обслуживают учебные звонки.

Python 3.13 · FastAPI · SQLAlchemy · PostgreSQL 17 + pgvector · Docker Compose · uv.

## Развёртывание

Нужны Docker Compose и соседние каталоги `112-backend` / `112-frontend`. Все команды ниже выполняются из `112-backend`.

При первом запуске создайте конфигурацию:

```sh
cp .env.example .env
openssl rand -hex 32
```

Запишите полученное значение в `JWT_SECRET_KEY` в `.env`. Для сервера замените тестовый `POSTGRES_PASSWORD` и обновите пароль в `DATABASE_URL`. Все настройки с пояснениями перечислены в [.env.example](.env.example).

```sh
docker compose up --build -d --wait
docker compose exec llm ollama pull qwen3:4b-instruct-2507-q4_K_M
docker compose exec llm ollama pull qwen3-embedding:0.6b
```

Compose применяет миграции и запускает интерфейс, API, БД, Ollama, ИИ-воркер и озвучку. Модели скачиваются один раз; для первой сборки и загрузки нужен интернет.

- **Интерфейс:** http://localhost:8080
- **Swagger:** http://localhost:8000/docs
- **Первый вход:** `admin` / `admin`; система потребует сменить пароль.

По умолчанию порты доступны только на этом компьютере. Для доступа к серверу настройте HTTPS-прокси на порт `8080`: [пример Nginx, маршруты API и WebSocket для звонков](docs/HTTPS.md).

### SIP-сервер и учебные звонки

В `.env` установите `TELEPHONY_ENABLED=true` и запишите в `ARI_PASSWORD` результат отдельного вызова `openssl rand -hex 32`. Затем включите Asterisk и воркер звонков:

```sh
docker compose --profile telephony up --build -d --wait
```

В кабинете администратора создайте телефонное место и закрепите его за учеником. Для проверки на одном компьютере подходят адреса по умолчанию; для других компьютеров задайте `SIP_PUBLIC_ADDRESS` (IPv4 сервера) и `SIP_BIND_ADDRESS=0.0.0.0`. Гарнитуре браузера нужен HTTPS либо `localhost`. [Настройка браузера, SIP-телефона и сетевых портов](docs/TELEPHONY.md).

### Тестовые данные

Наполнить демонстрационный стенд:

```sh
docker compose run --rm --build --no-deps api python scripts/seed_demo.py --database --full-demo --prefix demo --state-file /home/appuser/telephony/.demo-seed.json
```

[Демо-аккаунты и пароли](docs/SEED.md#учётные-записи). Сохраняйте файл состояния для повторного запуска.

Прочитать новый пароль администратора после выполнения seed:

```sh
docker compose exec -T api python -c 'import json; from pathlib import Path; print(json.loads(Path("/home/appuser/telephony/.demo-seed.json").read_text())["admin_new_password"])'
```

Для другого `--state-file` замените путь. [Восстановление пароля](docs/SEED.md#восстановление-пароля-администратора).

## Разработка

После настройки `.env` установите **uv**. БД работает в Docker, API — локально с автоперезагрузкой. Если API уже запущен в Compose, сначала выполните `docker compose stop api`.

```sh
uv sync --locked
uv run pre-commit install
docker compose up -d --wait db
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0
```

Этот режим запускает только БД и API. Для ИИ, озвучки и звонков нужны соответствующие сервисы Compose. [Проверки и отдельная тестовая БД](docs/DEVELOPMENT.md).

## Сервисы

```mermaid
flowchart LR
    Frontend["Frontend · Nginx"] -->|HTTP| API["FastAPI"]
    API <--> DB[("PostgreSQL + pgvector<br/>Данные и очередь задач")]
    Worker["ИИ-воркер"] <--> DB
    Worker --> LLM["Ollama"]
    Speech["Озвучка · Piper"] <--> DB
    Calls["Воркер звонков"] <--> DB
    Calls <-->|ARI| PBX["Asterisk"]
```

Piper сохраняет готовые записи в общий том; Asterisk воспроизводит их во время звонка. Телефония включается отдельно профилем `telephony` — [настройка](docs/TELEPHONY.md). [Голоса и озвучка](docs/AUDIO.md).

## Структура

```text
app/
  api/       HTTP-обработчики и права доступа
  services/  Учебные процессы и фоновые задачи
  domain/    Общие предметные правила
  schemas/   Контракты и валидация
  models/    Модели БД
  core/, db/ Настройки, инфраструктура, подключение к БД
alembic/     Миграции
scripts/     Наполнение БД и служебные команды
tests/       Тесты
performance/ Нагрузочные проверки
```

Подробнее: [архитектура](docs/BACKEND_ARCHITECTURE.md), [оценивание](docs/ASSESSMENT_ARCHITECTURE.md), [генерация карточек](docs/GENERATION.md), [память ИИ](docs/AI.md).

[Все инструкции](docs/README.md) · [Как устроено обучение](docs/TRAINING.md)
