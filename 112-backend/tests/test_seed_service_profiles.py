import pytest
from sqlalchemy import select

from app.models import Service, ServiceProfile, TrainingContact, User
from app.schemas.service_profile import ProfileInput
from app.services.service_profiles import create_profile, publish_profile
from scripts.seed_service_profiles import (
    DatabaseProfilesGateway,
    populate_service_profiles,
    profile_data,
)


@pytest.mark.anyio
async def test_profiles_preserve_existing_and_resume_only_unchanged_seed_draft(db_session):
    admin = await db_session.scalar(select(User).where(User.is_admin.is_(True)))
    services = [
        Service(code=f"profile-seed-{i}", name=f"Учебная служба {i}", is_active=i != 4)
        for i in range(5)
    ]
    db_session.add_all(services)
    await db_session.flush()
    payloads = [profile_data({"id": s.id, "name": s.name}) for s in services]
    saved = await create_profile(
        db_session, ProfileInput.model_validate(payloads[0] | {"name": "Профиль администратора"})
    )
    saved = await publish_profile(db_session, saved.id, admin.id)
    interrupted = await create_profile(db_session, ProfileInput.model_validate(payloads[1]))
    edited = await create_profile(
        db_session, ProfileInput.model_validate(payloads[2] | {"procedure": "Особые указания"})
    )
    gateway = DatabaseProfilesGateway(db_session, admin.id)
    assert await populate_service_profiles(gateway) == {
        "service_count": 4,
        "published_count": 4,
    }
    profiles = list(await db_session.scalars(select(ServiceProfile)))
    assert len(profiles) == 5  # Four published profiles and the administrator's draft.
    assert await gateway.detail(str(saved.id)) == saved.model_dump(mode="json")
    assert await gateway.detail(str(edited.id)) == edited.model_dump(mode="json")
    resumed = await gateway.detail(str(interrupted.id))
    assert resumed["status"] == "published"
    assert resumed["revision"] == 2
    assert not any(p.service_id == services[4].id for p in profiles)
    for profile in profiles:
        if profile.id == edited.id:
            continue
        contacts = list(
            await db_session.scalars(
                select(TrainingContact).where(TrainingContact.profile_id == profile.id)
            )
        )
        assert len(contacts) == 2
        assert {c.target_service_id for c in contacts} == {profile.service_id}
        assert {c.code for c in contacts} == {
            crew["contact_code"] for crew in profile.rules["crews"]
        }
    snapshot = [await gateway.detail(str(p.id)) for p in profiles]
    await populate_service_profiles(gateway)
    assert [await gateway.detail(str(p.id)) for p in profiles] == snapshot
    assert len(list(await db_session.scalars(select(ServiceProfile)))) == 5


@pytest.mark.anyio
async def test_http_profiles_only_does_not_load_catalog_or_change_training(
    db_client, db_session, monkeypatch, tmp_path
):
    from functools import partial

    import anyio
    from sqlalchemy import func

    from app.models import ClassifierVersion, Lesson
    from scripts import seed_demo, source_catalog

    def unexpected_catalog():
        raise AssertionError("Profiles-only mode must not load or replace the catalog")

    monkeypatch.setattr(source_catalog, "load_catalog", unexpected_catalog)
    db_session.add_all([Service(code=f"http-profile-{i}", name=f"Служба {i}") for i in range(2)])
    await db_session.flush()

    class InProcessAPI(seed_demo.API):
        def request(self, method, path, payload=None, expected=(200,)):
            async def send():
                return await db_client.request(
                    method,
                    f"/api/v1/{path}",
                    json=payload,
                    headers={"Authorization": f"Bearer {self.token}"} if self.token else {},
                )

            response = anyio.from_thread.run(send)
            if response.status_code not in expected:
                raise seed_demo.APIError(method, path, response.status_code)
            return response.json() if response.content else None

    monkeypatch.setattr(seed_demo, "API", InProcessAPI)
    run = partial(
        seed_demo.run,
        "http://test",
        tmp_path / "profiles.json",
        "test",
        "admin",
        profiles_only=True,
    )
    first = await anyio.to_thread.run_sync(run)
    assert first == {"service_profiles": {"service_count": 2, "published_count": 2}}
    assert await anyio.to_thread.run_sync(run) == first
    for model, expected in [(ServiceProfile, 2), (ClassifierVersion, 0), (Lesson, 0), (User, 1)]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == expected
