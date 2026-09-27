"""Provision a fresh performance database; refuses any other database or used dataset."""

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import engine, session_factory
from app.models import (
    ClassifierEntry,
    ClassifierRoute,
    ClassifierVersion,
    Service,
    ServiceProfile,
    User,
)
from app.models.enums import PublicationStatus

PASSWORD = "performance-user-123"


async def provision(users: int, cards: int, dds_interval: int = 60):
    if settings.database_url.path != "/perf112" or settings.app_name != "System112 performance":
        raise RuntimeError("Seed permitted only in the isolated perf112 database")
    target = "http://api:8000"
    async with httpx.AsyncClient(base_url=target, timeout=120, trust_env=False) as client:
        response = await client.get("/openapi.json")
        response.raise_for_status()
        if response.json()["info"]["title"] != settings.app_name:
            raise RuntimeError("Target API is not the performance stand")
        async with session_factory() as session:
            if await session.scalar(select(func.count()).select_from(User)) != 1:
                raise RuntimeError("Dataset already exists: use a fresh performance volume")
            await session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_stat_statements"))
            hashed = hash_password(PASSWORD)
            teacher = User(
                username="perf-teacher",
                password_hash=hashed,
                is_teacher=True,
                must_change_password=False,
            )
            students = [
                User(
                    username=f"perf-student-{i:05d}",
                    password_hash=hashed,
                    must_change_password=False,
                )
                for i in range(users)
            ]
            session.add_all([teacher, *students])
            await session.flush()
            approval = dict(
                status=PublicationStatus.PUBLISHED,
                approved_by_id=teacher.id,
                approved_at=datetime.now(UTC),
            )
            service = Service(code="PERF-101", name="Нагрузочная пожарная служба")
            catalog = ClassifierVersion(
                label="Нагрузочный ЕКП",
                source_filename="performance.json",
                source_storage_key="performance/catalog",
                source_sha256="a" * 64,
                **approval,
            )
            session.add_all([service, catalog])
            await session.flush()
            profile = ServiceProfile(
                service_id=service.id,
                version=1,
                name="Нагрузочный профиль",
                responsibility="Учебная территория",
                rules={"crews": [{"code": "main", "name": "Бригада № 1", "is_active": True}]},
                **approval,
            )
            entry = ClassifierEntry(
                classifier_version_id=catalog.id,
                code="101",
                section="Пожар",
                name="Пожар",
                source_sheet="test",
                source_row=1,
                source_data={},
            )
            session.add_all([entry, profile])
            await session.flush()
            session.add(
                ClassifierRoute(entry_id=entry.id, service_id=service.id, service_name=service.name)
            )
            await session.commit()

        async def request(method, path, payload=None):
            r = await client.request(method, "/api/v1/" + path, json=payload)
            if r.is_error:
                raise RuntimeError(f"Provision {method} {path}: {r.status_code} {r.text[:800]}")
            return r.json() if r.content else None

        token = await request(
            "POST", "auth/login", {"username": teacher.username, "password": PASSWORD}
        )
        client.headers["Authorization"] = "Bearer " + token["access_token"]
        group = await request("POST", "groups", {"name": "Нагрузочная группа"})
        for student in students:
            await request("PUT", f"groups/{group['id']}/students/{student.id}")
        answer = {"address_text": "Москва, Учебная улица, 1", "description": "Горит мусор"}
        lessons = {}
        for role in ("operator_112", "dds"):
            payload = dict(
                title=f"Нагрузочная карточка {role}",
                classifier_version_id=str(catalog.id),
                classifier_entry_id=str(entry.id),
                caller_message="Горит мусор. Москва, Учебная улица, 1.",
                data=answer,
                recipient_service_ids=[str(service.id)],
            )
            if role == "dds":
                payload["dds_exercise"] = {
                    "workflow": "crews-v2",
                    "service_profile_id": str(profile.id),
                    "crew_calls_required": False,
                    "initial_crews": [],
                    "required_crews": [{"crew_code": "main", "status": "completed"}],
                    "messages": [
                        {
                            "crew_code": "main",
                            "message": "Назначьте бригаду. Она приняла вызов, выехала, "
                            "прибыла, начала и завершила работы.",
                        }
                    ],
                }
            card = await request("POST", "cards", payload)
            scenario = await request(
                "POST",
                "scenarios",
                {
                    "title": f"Нагрузочный сценарий {role}",
                    "role": role,
                    "card_ids": [card["id"]] * cards,
                    "duration_minutes": 120,
                    "service_profile_id": str(profile.id) if role == "dds" else None,
                    "arrival_offsets_seconds": [
                        i * dds_interval if role == "dds" else 0 for i in range(cards)
                    ],
                },
            )
            lesson = await request(
                "POST",
                "lessons/start",
                {
                    "request_id": str(uuid4()),
                    "group_id": group["id"],
                    "scenario_version_id": scenario["id"],
                    "learning": {"kind": "practice"},
                    "time_limit_seconds": 7200,
                },
            )
            lessons[role] = lesson["id"]
        manifest = {
            "format": 1,
            "target": target,
            "created_at": datetime.now(UTC).isoformat(),
            "teacher": {"username": teacher.username, "password": PASSWORD},
            "students": [{"username": s.username, "password": PASSWORD} for s in students],
            "lessons": lessons,
            "group_id": group["id"],
            "cards_per_role": cards,
            "dds_interval_seconds": dds_interval,
            "classifier_id": str(catalog.id),
            "entry_id": str(entry.id),
            "service_id": str(service.id),
            "answer": answer,
        }
        path = Path("performance/artifacts/manifest.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as stream:
            json.dump(manifest, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        print(f"Prepared {users} students, {cards} cards per role. Manifest: {path}")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--users", type=int, choices=range(1, 1001), default=100, metavar="1..1000")
    parser.add_argument("--cards", type=int, choices=range(1, 101), default=20, metavar="1..100")
    parser.add_argument(
        "--dds-interval", type=int, choices=range(0, 61), default=60, metavar="0..60"
    )
    args = parser.parse_args()
    asyncio.run(provision(args.users, args.cards, args.dds_interval))
