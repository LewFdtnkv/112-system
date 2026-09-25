import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from app.api.health import router as health_router
from app.api.v1.router import router as api_router
from app.api.validation import validation_error_response
from app.core.config import settings
from app.core.request_log import configure_request_log, logger, record_request
from app.core.security import signing_key
from app.db.session import engine, session_factory
from app.services.deadlines import deadline_worker


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    signing_key()  # Fail startup if authentication has no signing secret.
    log_handler = configure_request_log()
    worker = asyncio.create_task(deadline_worker(session_factory))
    try:
        yield
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker
        logger.removeHandler(log_handler)
        log_handler.close()
        await engine.dispose()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_exception_handler(RequestValidationError, validation_error_response)
app.middleware("http")(record_request)
app.include_router(health_router)
app.include_router(api_router, prefix="/api/v1")
