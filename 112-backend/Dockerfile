FROM python:3.13-slim AS dependencies

COPY --from=ghcr.io/astral-sh/uv:0.12.8 /uv /usr/local/bin/uv

ENV SYSTEM_LOG_DIRECTORY=/home/appuser/logs \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-cache \
    && useradd --create-home --uid 10001 appuser \
    && install -d -o appuser -g appuser /home/appuser/logs /home/appuser/telephony

FROM dependencies AS runtime
COPY app ./app
COPY scripts ./scripts
COPY alembic ./alembic
COPY alembic.ini ./

USER appuser
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM dependencies AS speech-dependencies
USER root
RUN uv sync --frozen --no-dev --group tts --no-cache
COPY scripts/voices/download.py /app/download-voices.py
RUN python /app/download-voices.py /opt/voices

FROM runtime AS speech-worker
COPY --from=speech-dependencies /app/.venv /app/.venv
COPY --from=speech-dependencies /opt/voices /opt/voices
CMD ["python", "-m", "app.services.speech.worker"]

# Default image stays lightweight: API/LLM worker do not import or install Piper.
FROM runtime AS final
