"""Reject non-finite JSON before commands and keep validation errors JSON-safe."""

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.schemas.numbers import invalid_json_number


async def validate_json_numbers(request: Request):
    # FastAPI already decoded/cached model bodies. Do not consume streaming uploads:
    # those have their own size limits and parsers (catalog JSON, WAV and photos).
    route = request.scope.get("route")
    if getattr(route, "body_field", None) is None:
        return
    content_type = (
        request.headers.get("content-type", "application/json").split(";", 1)[0].strip().lower()
    )
    if content_type != "application/json" and not (
        content_type.startswith("application/") and content_type.endswith("+json")
    ):
        return
    if not await request.body():
        return
    if error := invalid_json_number(await request.json()):
        path, message = error
        raise RequestValidationError(
            [{"type": "finite_number", "loc": ("body", *path), "msg": message}]
        )


async def validation_error_response(request: Request, exc: RequestValidationError):
    # Never echo submitted inputs (including passwords) or exception contexts.
    # NaN/Infinity in Pydantic's diagnostic input otherwise breaks JSONResponse.
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()
            ]
        },
    )
