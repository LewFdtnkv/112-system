"""Regressions for numeric audit A-03/A-04, through the actual HTTP boundary."""

import json
import re
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.exceptions import RequestValidationError
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.api.dependencies import require_admin, require_student, require_teacher, require_user
from app.api.validation import validation_error_response
from app.db.session import get_session
from app.main import app
from app.models import AttemptEvent, IncidentCard
from app.schemas.authoring import CardCreate, CardData, CardUpdate
from app.schemas.dds import CrewCommand, DDSAction, DDSFinish
from app.schemas.lesson_evaluation import LessonGradeCreate
from app.schemas.numbers import INT32_MAX, INT64_MAX, JS_SAFE_INTEGER
from app.schemas.student import CardSubmit, DraftData, DraftSave

pytestmark = pytest.mark.anyio


@pytest.fixture
async def validation_client():
    class NoDatabase:
        def __getattr__(self, name):
            raise AssertionError(f"Invalid input reached database: {name}")

    async def session():
        yield NoDatabase()

    def user():
        return SimpleNamespace(
            id=uuid4(), is_admin=False, is_teacher=True, must_change_password=False
        )

    previous = app.dependency_overrides.copy()
    app.dependency_overrides.update(
        {
            get_session: session,
            **{
                dep: user for dep in (require_user, require_teacher, require_student, require_admin)
            },
        }
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


async def test_all_pagination_and_event_queries_reject_overflow_before_sql(validation_client):
    checked = set()
    for path, operations in app.openapi()["paths"].items():
        operation = operations.get("get", {})
        for parameter in operation.get("parameters", []):
            name = parameter["name"]
            if parameter["in"] != "query" or name not in {
                "offset",
                "active_offset",
                "after",
                "through",
            }:
                continue
            url = re.sub(r"\{[^}]+\}", str(uuid4()), path)
            maximum = INT32_MAX if name in {"after", "through"} else INT64_MAX
            for value in (str(maximum + 1), "9" * 1000, "-1"):
                response = await validation_client.get(url, params={name: value})
                assert response.status_code == 422, (path, name, response.text)
                assert any(e["loc"] == ["query", name] for e in response.json()["detail"])
            checked.add((path, name))
    assert len(checked) >= 35


@pytest.mark.parametrize("literal", ["1e309", "-1e309", "NaN", "Infinity", "-Infinity"])
async def test_nonfinite_json_rejected_even_in_untyped_nested_fields(validation_client, literal):
    for url, body in [
        ("/api/v1/auth/login", '{"username":"missing","password":VALUE}'),
        ("/api/v1/addresses/reverse", '{"latitude":VALUE,"longitude":37}'),
        (
            f"/api/v1/student/attempts/{uuid4()}/card",
            '{"revision":1,"data":{"additional_fields":{"nested":[{"n":VALUE}]}}}',
        ),
        (
            f"/api/v1/lessons/{uuid4()}/students/{uuid4()}/evaluations",
            '{"score":VALUE,"max_score":100}',
        ),
        (
            f"/api/v1/lessons/{uuid4()}/students/{uuid4()}/evaluations",
            '{"score":1,"max_score":VALUE}',
        ),
    ]:
        method = "PUT" if url.endswith("/card") else "POST"
        response = await validation_client.request(
            method,
            url,
            content=body.replace("VALUE", literal),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"][0]["type"] == "finite_number"
        assert "input" not in response.json()["detail"][0]


async def test_validation_errors_are_json_safe_and_do_not_echo_secrets(validation_client):
    response = await validation_client.post(
        "/api/v1/auth/login", json={"username": "", "password": "private-test-password"}
    )
    assert response.status_code == 422
    assert "private-test-password" not in response.text
    result = await validation_error_response(
        None,
        RequestValidationError(
            [
                {
                    "loc": ("body", "password"),
                    "type": "string_type",
                    "msg": "Input should be a valid string",
                    "input": float("inf"),
                    "ctx": {"error": ValueError("secret")},
                }
            ]
        ),
    )
    assert result.status_code == 422
    assert json.loads(result.body)["detail"] == [
        {
            "loc": ["body", "password"],
            "type": "string_type",
            "msg": "Input should be a valid string",
        }
    ]
    malformed = await validation_client.post(
        "/api/v1/auth/login", content='{"password":', headers={"Content-Type": "application/json"}
    )
    assert malformed.status_code == 422


@pytest.mark.parametrize("model", [DraftSave, CardCreate])
def test_free_json_numbers_are_finite_and_browser_safe(model):
    from pydantic import TypeAdapter

    adapter = TypeAdapter(model.model_fields["data"].rebuild_annotation())
    for field in ("caller_details", "address_details", "features", "additional_fields"):
        for invalid in (
            float("nan"),
            float("inf"),
            -float("inf"),
            JS_SAFE_INTEGER + 1,
            10**100,
            1e100,
        ):
            with pytest.raises(ValidationError):
                adapter.validate_python(
                    {"description": "Сообщение", field: {"nested": [{"value": invalid}]}}
                )
    data = adapter.validate_python(
        {
            "description": "Сообщение",
            "additional_fields": {
                "max": JS_SAFE_INTEGER,
                "min": -JS_SAFE_INTEGER,
                "latitude": 55.751,
                "text": "1e309",
                "bool": True,
                "null": None,
            },
        }
    )
    assert data.additional_fields["max"] == JS_SAFE_INTEGER
    assert data.additional_fields["text"] == "1e309"
    # Previously stored finite values remain readable; only new writes are restricted.
    for read_model in (CardData, DraftData):
        assert (
            read_model.model_validate(
                {"description": "Old", "additional_fields": {"n": 10**100}}
            ).additional_fields["n"]
            == 10**100
        )


def test_revision_fields_reject_out_of_storage_range_and_coercion():
    # Inspect each writable revision schema without bypassing model validators.
    from pydantic import TypeAdapter

    from app.schemas.catalog_document import EntryUpdate
    from app.schemas.service_profile import ProfileUpdate

    for model in (
        CardUpdate,
        DraftSave,
        CardSubmit,
        DDSAction,
        DDSFinish,
        CrewCommand,
        LessonGradeCreate,
        EntryUpdate,
        ProfileUpdate,
    ):
        name = "expected_revision" if "expected_revision" in model.model_fields else "revision"
        adapter = TypeAdapter(model.model_fields[name].rebuild_annotation())
        for invalid in (INT32_MAX + 1, 2**63, True, 1.0, "1"):
            with pytest.raises(ValidationError):
                adapter.validate_python(invalid)
        assert adapter.validate_python(INT32_MAX) == INT32_MAX


async def test_rejected_numbers_do_not_mutate_card_or_audit(exercise, db_client, db_session):
    e = exercise
    attempt = await e.start()
    aid = UUID(attempt["id"])
    url = f"/api/v1/student/attempts/{aid}/card"
    before = await db_session.scalar(
        select(func.count()).select_from(AttemptEvent).where(AttemptEvent.attempt_id == aid)
    )
    for literal in ("1e309", "NaN", "Infinity", str(JS_SAFE_INTEGER + 1), "1" + "0" * 100):
        response = await db_client.put(
            url,
            headers=e.t.headers["student"] | {"Content-Type": "application/json"},
            content='{"revision":1,"data":{"additional_fields":{"nested":[{"n":'
            + literal
            + "}]}}}",
        )
        assert response.status_code == 422, response.text
    row = await db_session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == aid))
    await db_session.refresh(row)
    assert row.revision == 1 and row.additional_fields == {}
    after = await db_session.scalar(
        select(func.count()).select_from(AttemptEvent).where(AttemptEvent.attempt_id == aid)
    )
    assert after == before
    response = await db_client.get(
        "/api/v1/users", headers=e.t.headers["teacher"], params={"offset": INT64_MAX}
    )
    assert response.status_code == 200 and response.json() == []
    # A valid command still succeeds after rejected input; strings are never rewritten.
    saved = await e.request(
        "PUT",
        f"student/attempts/{aid}/card",
        {"revision": 1, "data": {"additional_fields": {"n": JS_SAFE_INTEGER, "text": "1e309"}}},
    )
    assert saved["card"]["data"]["additional_fields"]["n"] == JS_SAFE_INTEGER


async def test_json_content_types_and_finite_wrong_types(validation_client):
    for content_type in (None, "application/json; charset=utf-8", "application/problem+json"):
        headers = {"Content-Type": content_type} if content_type else {}
        response = await validation_client.post(
            "/api/v1/auth/login",
            content='{"username":"missing","password":1e309}',
            headers=headers,
        )
        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "finite_number"
    response = await validation_client.post(
        "/api/v1/auth/login",
        content='{"username":"missing","password":1e308}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "string_type"


async def test_streaming_catalog_still_enforces_size_limit(validation_client):
    response = await validation_client.post(
        "/api/v1/admin/classifiers/import",
        content=b" " * (8 * 1024 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    response = await validation_client.post(
        "/api/v1/admin/classifiers/import",
        content='{"label":NaN}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
