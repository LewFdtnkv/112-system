import asyncio
import json
from pathlib import Path

import pytest
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.api.errors import http_error_response, public_error
from app.api.validation import validation_error_response


@pytest.mark.parametrize(
    "detail, expected", json.loads(Path("app/api/error_catalog.json").read_text())["fields"].items()
)
def test_known_fields_preserve_message_and_path(detail, expected):
    if detail.startswith("Value error, "):
        payload = [{"loc": ["body", "parent", 0], "type": "value_error", "msg": detail}]
        path = f"parent.0.{expected[0]}"
    else:
        payload, path = detail, expected[0]
    result = public_error(payload)
    assert result["detail"] == payload
    assert result["field_errors"][0]["path"] == path
    assert result["field_errors"][0]["message"] == expected[1]


@pytest.mark.parametrize(
    "detail, message",
    json.loads(Path("app/api/error_catalog.json").read_text())["messages"].items(),
)
def test_known_messages_preserved(detail, message):
    assert public_error(detail)["message"] == message


def test_unknown_diagnostics_not_used_as_ui_message_and_input_is_removed():
    error = RequestValidationError(
        [
            {
                "loc": ["body", "password"],
                "msg": "private diagnostic",
                "type": "value_error",
                "input": "secret",
                "ctx": {"token": "secret"},
            }
        ]
    )
    response = asyncio.run(validation_error_response(None, error))
    body = json.loads(response.body)
    assert "secret" not in response.body.decode()
    assert body["field_errors"] == [
        {"path": "password", "message": "Проверьте значение этого поля.", "code": "value_error"}
    ]
    assert "message" not in public_error("private diagnostic")


def test_http_status_headers_and_domain_path_preserved():
    error = HTTPException(
        409,
        [
            {
                "type": "form_constraint",
                "loc": ["body", "dds_exercise", "service_profile_id"],
                "msg": "Выберите профиль.",
            }
        ],
        headers={"Retry-After": "2"},
    )
    response = asyncio.run(http_error_response(None, error))
    assert response.status_code == 409
    assert response.headers["retry-after"] == "2"
    assert json.loads(response.body)["field_errors"] == [
        {
            "path": "dds_exercise.service_profile_id",
            "message": "Выберите профиль.",
            "code": "form_constraint",
        }
    ]
