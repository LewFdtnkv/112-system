from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.anyio
async def test_liveness_without_database() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    "payload",
    [
        {"code": "room 7", "name": "Место 7"},
        {"code": "room-7", "name": "   "},
        {"code": "room-7", "name": "Место 7", "sip_password": "unexpected"},
    ],
)
@pytest.mark.anyio
async def test_invalid_payload_without_database(payload: dict[str, str]) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/workstations", json=payload)
    assert response.status_code == 422


@pytest.mark.anyio
async def test_workstation_lifecycle(db_client: AsyncClient) -> None:
    payload = {"code": f"test-{uuid4().hex}", "name": "Класс 1, место 7"}
    response = await db_client.post("/api/v1/workstations", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == payload["name"]
    assert created["created_at"]

    response = await db_client.get(f"/api/v1/workstations/{created['id']}")
    assert response.json() == created
    response = await db_client.get("/api/v1/workstations?limit=100")
    assert created in response.json()

    response = await db_client.post("/api/v1/workstations", json=payload)
    assert response.status_code == 409
    response = await db_client.get(f"/api/v1/workstations/{created['id']}")
    assert response.status_code == 200
    response = await db_client.get(f"/api/v1/workstations/{uuid4()}")
    assert response.status_code == 404
    response = await db_client.get("/api/v1/workstations?limit=101")
    assert response.status_code == 422


@pytest.mark.anyio
async def test_readiness(db_client: AsyncClient) -> None:
    response = await db_client.get("/health/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"
