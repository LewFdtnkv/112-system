import json
from uuid import uuid4

import httpx
import pytest
from fastapi.routing import iter_route_contexts
from pydantic import SecretStr

from app.api.v1.location_services import external_client
from app.core.config import settings
from app.core.security import hash_password
from app.main import app
from app.models import User
from app.services.location_services import address_item

PATHS = [
    ("addresses/suggest", {"query": "Москва", "count": 5}),
    ("addresses/reverse", {"latitude": 55.75, "longitude": 37.61, "count": 1}),
    ("translations/translate", {"text": "Help", "target_language_code": "ru"}),
]
SUGGESTION = {
    "value": "г Москва, ул Тверская, д 1, корп 2, кв 3",
    "data": {
        "country": "Россия",
        "region_with_type": "г Москва",
        "city": "Москва",
        "street_with_type": "ул Тверская",
        "house": "1",
        "block_type": "к",
        "block": "2",
        "flat": "3",
        "city_area": "Центральный",
        "city_district": "Тверской",
        "geo_lat": "55.75",
        "geo_lon": "37.61",
    },
}


@pytest.fixture
async def upstream(monkeypatch):
    requests = []
    response = {"status": 200, "json": {"suggestions": [SUGGESTION]}}

    def handle(request):
        requests.append(request)
        if response.get("timeout"):
            raise httpx.ReadTimeout("secret-provider-data", request=request)
        if "raw" in response:
            return httpx.Response(response["status"], text=response["raw"])
        return httpx.Response(response["status"], json=response["json"])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:

        async def override():
            yield client

        app.dependency_overrides[external_client] = override
        monkeypatch.setattr(settings, "dadata_api_key", SecretStr("test-dadata-secret"))
        monkeypatch.setattr(settings, "yandex_translate_api_key", SecretStr("test-yandex-secret"))
        monkeypatch.setattr(settings, "yandex_cloud_folder_id", None)
        try:
            yield requests, response
        finally:
            app.dependency_overrides.pop(external_client, None)


@pytest.fixture
async def account(db_client, db_session):
    user = User(
        username=f"maps-{uuid4()}",
        password_hash=hash_password("maps-test-password"),
        must_change_password=False,
    )
    db_session.add(user)
    await db_session.commit()
    result = await db_client.post(
        "/api/v1/auth/login",
        json={
            "username": user.username,
            "password": "maps-test-password",
        },
    )
    assert result.status_code == 200
    return user, {"Authorization": f"Bearer {result.json()['access_token']}"}


@pytest.mark.anyio
async def test_protected_routes_reject_missing_forced_and_inactive_accounts(
    db_client, db_session, account, upstream
):
    user, headers = account
    requests, _ = upstream
    for path, body in PATHS:
        assert (await db_client.post(f"/api/v1/{path}", json=body)).status_code == 401
    user.must_change_password = True
    await db_session.commit()
    for path, body in PATHS:
        result = await db_client.post(f"/api/v1/{path}", headers=headers, json=body)
        assert result.status_code == 403
    user.must_change_password = False
    user.is_active = False
    await db_session.commit()
    for path, body in PATHS:
        assert (
            await db_client.post(f"/api/v1/{path}", headers=headers, json=body)
        ).status_code == 401
    assert requests == []


@pytest.mark.anyio
async def test_address_contract_and_reverse_coordinates(db_client, account, upstream):
    _, headers = account
    requests, _ = upstream
    for path, body in PATHS[:2]:
        result = await db_client.post(f"/api/v1/{path}", headers=headers, json=body)
        assert result.status_code == 200, result.text
        assert result.json()["items"] == [
            {
                "point": {"latitude": 55.75, "longitude": 37.61},
                "addressLine": SUGGESTION["value"],
                "country": "Россия",
                "administrativeAreas": ["г Москва"],
                "localities": ["Москва"],
                "district": "Центральный",
                "area": "Тверской",
                "street": "ул Тверская",
                "house": "1",
                "building": "2",
                "structure": "",
                "apartment": "3",
            }
        ]
        assert "secret" not in result.text
    assert str(requests[0].url).endswith("/suggest/address")
    assert str(requests[1].url).endswith("/geolocate/address")
    assert requests[0].headers["authorization"] == "Token test-dadata-secret"
    assert json.loads(requests[1].content) == {"lat": 55.75, "lon": 37.61, "count": 1}


@pytest.mark.parametrize("folder_id", [None, "test-folder"])
@pytest.mark.anyio
async def test_translation_contract_and_plain_text(
    db_client, account, upstream, monkeypatch, folder_id
):
    monkeypatch.setattr(settings, "yandex_cloud_folder_id", folder_id)
    _, headers = account
    requests, response = upstream
    response["json"] = {"translations": [{"text": "Нужна помощь", "detectedLanguageCode": "en"}]}
    result = await db_client.post(
        "/api/v1/translations/translate",
        headers=headers,
        json={"text": " Help ", "target_language_code": "ru"},
    )
    assert result.status_code == 200
    assert result.json() == {"text": "Нужна помощь", "detected_language_code": "en"}
    assert requests[0].headers["authorization"] == "Api-Key test-yandex-secret"
    assert json.loads(requests[0].content) == {
        "texts": ["Help"],
        "targetLanguageCode": "ru",
        "format": "PLAIN_TEXT",
        **({"folderId": folder_id} if folder_id else {}),
    }


@pytest.mark.parametrize(
    "path,body",
    [
        ("addresses/suggest", {"query": " "}),
        ("addresses/suggest", {"query": "a" * 301}),
        ("addresses/suggest", {"query": "Москва", "count": 21}),
        ("addresses/suggest", {"query": "Москва", "url": "http://localhost"}),
        ("addresses/reverse", {"latitude": 91, "longitude": 37}),
        ("addresses/reverse", {"latitude": 55, "longitude": -181}),
        ("addresses/reverse", {"latitude": "NaN", "longitude": 37}),
        ("translations/translate", {"text": " "}),
        ("translations/translate", {"text": "a" * 5001}),
        ("translations/translate", {"text": "help", "target_language_code": "en"}),
    ],
)
@pytest.mark.anyio
async def test_invalid_input_never_calls_provider(db_client, account, upstream, path, body):
    _, headers = account
    requests, _ = upstream
    result = await db_client.post(f"/api/v1/{path}", headers=headers, json=body)
    assert result.status_code == 422
    assert requests == []


@pytest.mark.parametrize(
    "mode", ["missing-key", "timeout", "403", "429", "500", "bad-json", "bad-shape"]
)
@pytest.mark.anyio
async def test_provider_failures_are_safe(db_client, account, upstream, monkeypatch, mode):
    _, headers = account
    requests, response = upstream
    if mode == "missing-key":
        monkeypatch.setattr(settings, "dadata_api_key", SecretStr(""))
        monkeypatch.setattr(settings, "yandex_translate_api_key", None)
    elif mode == "timeout":
        response["timeout"] = True
    elif mode.isdigit():
        response.update(status=int(mode), json={"error": "secret-provider-data"})
    elif mode == "bad-json":
        response["raw"] = "secret-provider-data"
    else:
        response["json"] = {"unexpected": "secret-provider-data"}
    for path, body in PATHS:
        result = await db_client.post(f"/api/v1/{path}", headers=headers, json=body)
        assert result.status_code == 503
        assert result.json()["detail"] in {
            "Address search is temporarily unavailable",
            "Translation is temporarily unavailable",
        }
        assert "secret" not in result.text
    assert len(requests) == (0 if mode == "missing-key" else 3)


def test_address_mapping_does_not_invent_coordinates_or_building_types():
    assert address_item({"value": "Москва", "data": {}}) is None
    assert address_item({"value": "Москва", "data": {"geo_lat": "nan", "geo_lon": "0"}}) is None
    item = address_item({**SUGGESTION, "data": {**SUGGESTION["data"], "block_type": "стр"}})
    assert item.structure == "2" and item.building == ""


def test_location_routes_have_one_handler_per_method():
    for path, _ in PATHS:
        matches = [
            route
            for route in iter_route_contexts(app.routes)
            if getattr(route, "path", None) == f"/api/v1/{path}"
            and "POST" in getattr(route, "methods", set())
        ]
        assert len(matches) == 1, path
