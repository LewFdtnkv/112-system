"""Reusable demo DDS directories for every active service; no changes to existing profiles."""

from collections import defaultdict


def profile_data(service):
    """Synthetic training crews, not a claim about the real service's structure."""
    return {
        "service_id": str(service["id"]),
        "name": f"Учебный профиль ДДС: {service['name']}"[:255],
        "responsibility": (
            f"Учебная работа от лица службы «{service['name']}». "
            "Территория и состав бригад условные; реальные зоны ответственности не заданы."
        ),
        "procedure": (
            "Изучите входящую карточку и сообщения бригад. Назначьте нужную учебную бригаду. "
            "Если упражнение требует звонка, оповестите её руководителя по учебному телефону. "
            "Вносите статусы и комментарии по полученным сообщениям. "
            "Служба остаётся в статусе «Добавлена»."
        ),
        "territories": [],
        "objects": [],
        "contacts": [
            {
                "code": f"crew-chief-{number}",
                "name": f"Руководитель учебной бригады № {number}",
                "description": "Учебный контакт для имитации оповещения бригады.",
                "target_service_id": str(service["id"]),
                "position": "Руководитель бригады",
                "endpoint_key": f"crew-chief-{number}",
            }
            for number in (1, 2)
        ],
        "crews": [
            {
                "code": f"crew-{number}",
                "name": f"Учебная бригада № {number}",
                "description": "Условная бригада для учебных карточек этой службы.",
                "contact_code": f"crew-chief-{number}",
                "is_active": True,
            }
            for number in (1, 2)
        ],
    }


async def populate_service_profiles(gateway):
    services, profiles = await gateway.directory()
    by_service = defaultdict(list)
    for profile in profiles:
        by_service[str(profile["service_id"])].append(profile)
    for service in services:
        existing = by_service[str(service["id"])]
        if any(p["status"] == "published" for p in existing):
            continue
        payload = profile_data(service)
        profile_id = None
        # Recover a seed interrupted between creation and publication. Never publish an
        # unrelated or edited draft, even if its name happens to match.
        for profile in existing:
            if profile["status"] != "draft" or profile["name"] != payload["name"]:
                continue
            detail = await gateway.detail(profile["id"])
            if {key: detail.get(key) for key in payload} == payload:
                profile_id = profile["id"]
                break
        if profile_id is None:
            profile_id = await gateway.create(payload)
        await gateway.publish(profile_id)
    return {"service_count": len(services), "published_count": len(services)}


class HTTPProfilesGateway:
    def __init__(self, admin):
        self.admin = admin

    def pages(self, path):
        rows = []
        offset = 0
        while True:
            response = self.admin.request("GET", f"{path}?limit=100&offset={offset}")
            items = response["items"]
            rows.extend(items)
            if len(items) < 100:
                return rows
            offset += len(items)

    async def directory(self):
        return (
            self.pages("views/admin/services"),
            self.pages("admin/service-profiles"),
        )

    async def detail(self, profile_id):
        return self.admin.request("GET", f"admin/service-profiles/{profile_id}")

    async def create(self, payload):
        return self.admin.request("POST", "admin/service-profiles", payload, expected=(201,))["id"]

    async def publish(self, profile_id):
        self.admin.request("POST", f"admin/service-profiles/{profile_id}/publish")


class DatabaseProfilesGateway:
    def __init__(self, session, admin_id):
        self.session = session
        self.admin_id = admin_id

    async def directory(self):
        from sqlalchemy import select

        from app.models import Service, ServiceProfile

        services = await self.session.scalars(
            select(Service).where(Service.is_active.is_(True)).order_by(Service.code)
        )
        profiles = await self.session.scalars(select(ServiceProfile))
        return (
            [{"id": str(s.id), "name": s.name} for s in services],
            [
                {
                    "id": str(p.id),
                    "service_id": str(p.service_id),
                    "name": p.name,
                    "status": p.status.value,
                }
                for p in profiles
            ],
        )

    async def detail(self, profile_id):
        from uuid import UUID

        from app.services.service_profiles import profile_read, profile_row

        return (
            await profile_read(self.session, await profile_row(self.session, UUID(profile_id)))
        ).model_dump(mode="json")

    async def create(self, payload):
        from app.schemas.service_profile import ProfileInput
        from app.services.service_profiles import create_profile

        return str((await create_profile(self.session, ProfileInput.model_validate(payload))).id)

    async def publish(self, profile_id):
        from uuid import UUID

        from app.services.service_profiles import publish_profile

        await publish_profile(self.session, UUID(profile_id), self.admin_id)
