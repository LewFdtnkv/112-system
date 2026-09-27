import json
import stat

import anyio
import pytest
from sqlalchemy import func, select

from app.models import (
    ClassifierEntry,
    ClassifierVersion,
    Lesson,
    Service,
    ServiceProfile,
    TrainingGroup,
    User,
)
from scripts import seed_demo


@pytest.mark.anyio
@pytest.mark.parametrize("with_training", [False, True])
async def test_seed_from_admin_only_database_and_repeat(
    db_client, db_session, monkeypatch, tmp_path, with_training
):
    class InProcessAPI(seed_demo.API):
        def request(self, method, path, payload=None, expected=(200,)):
            async def send():
                headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
                return await db_client.request(
                    method, f"/api/v1/{path}", json=payload, headers=headers
                )

            response = anyio.from_thread.run(send)
            if response.status_code not in expected:
                raise seed_demo.APIError(method, path, response.status_code)
            return response.json() if response.content else None

    monkeypatch.setattr(seed_demo, "API", InProcessAPI)
    state_path = tmp_path / "state.json"
    first = await anyio.to_thread.run_sync(
        seed_demo.run, "http://test", state_path, "test", "admin", with_training
    )
    second = await anyio.to_thread.run_sync(
        seed_demo.run, "http://test", state_path, "test", "admin", with_training
    )
    assert first == second
    for model, expected in [
        (User, 3 if with_training else 1),
        (TrainingGroup, 1 if with_training else 0),
        (Lesson, 16 if with_training else 0),
        (Service, 211),
        (ServiceProfile, 211),
        (ClassifierEntry, 51),
        (ClassifierVersion, 1),
    ]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == expected
    assert first["service_profiles"] == {"service_count": 211, "published_count": 211}
    service_ids = set(await db_session.scalars(select(Service.id)))
    profiles = list(await db_session.scalars(select(ServiceProfile)))
    assert {p.service_id for p in profiles} == service_ids
    assert all(p.status.value == "published" and len(p.rules["crews"]) == 2 for p in profiles)
    assert first["feature_count"] == 177
    if with_training:
        assert first["training"]["card_count"] == 14
        await assert_dds_seed(db_session, first["training"]["dds"])
        await assert_learning_seed(db_session, first["training"]["learning"])
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600
    state = json.loads(state_path.read_text())
    if with_training:
        for role in ("teacher", "student"):
            account = state["accounts"][role]
            assert account["password"] == f"test-{role}-123"
            assert first["training"]["accounts"][role]["password"] == account["password"]
            response = await db_client.post(
                "/api/v1/auth/login",
                json={"username": account["username"], "password": account["password"]},
            )
            assert response.status_code == 200
            assert response.json()["must_change_password"] is False
            rejected = await db_client.post(
                "/api/v1/auth/login",
                json={"username": account["username"], "password": account["initial_password"]},
            )
            assert rejected.status_code == 401
    assert state["admin_new_password"] not in json.dumps(first)
    with pytest.raises(RuntimeError, match="другому API"):
        seed_demo.State(state_path, "http://another", "test")
    assert json.loads(state_path.read_text()) == state


async def assert_dds_seed(session, result):
    from uuid import UUID

    from app.models import Assignment, Attempt, CrewAssignment, Evaluation, ServiceProfile

    completed = await session.get(Lesson, UUID(result["lessons"]["completed"]))
    active = await session.get(Lesson, UUID(result["lessons"]["active"]))
    assert completed.status.value == "finished" and completed.ended_at is not None
    assert active.status.value == "active" and active.ended_at is None
    profile = await session.get(ServiceProfile, UUID(result["profile_id"]))
    assert profile.status.value == "published"
    assert len(profile.rules["crews"]) == 2
    attempts = list(
        await session.scalars(
            select(Attempt)
            .join(Assignment)
            .where(
                Assignment.lesson_id == completed.id,
            )
        )
    )
    assert len(attempts) == 2
    for attempt in attempts:
        assert attempt.status.value == "completed"
        evaluation = await session.scalar(
            select(Evaluation).where(Evaluation.attempt_id == attempt.id)
        )
        assert evaluation.score == evaluation.max_score
        assert evaluation.context_snapshot["policy"]["version"] == "dds-crew-workflow-v1"
        crew = await session.scalar(
            select(CrewAssignment).where(CrewAssignment.attempt_id == attempt.id)
        )
        assert crew.status == "completed"
    active_attempts = list(
        await session.scalars(
            select(Attempt)
            .join(Assignment)
            .where(
                Assignment.lesson_id == active.id,
            )
        )
    )
    assert len(active_attempts) == 2
    assert all(a.status.value == "in_progress" for a in active_attempts)


@pytest.mark.anyio
@pytest.mark.parametrize("database", [False, True])
@pytest.mark.parametrize("phase", ["initial", "changed", "interrupted"])
async def test_upgrade_old_seed_credentials(db_client, db_session, tmp_path, database, phase):
    from app.schemas.user import UserCreate
    from app.services import auth
    from app.services.users import create_user
    from scripts.seed_training import DatabaseGateway, HTTPGateway

    account = {
        "username": "legacy-student",
        "initial_password": "old-initial-password",
        "password": "old-final-password",
        "pending_password": "legacy-student-123",
    }
    user = await create_user(
        db_session,
        UserCreate(
            username=account["username"],
            initial_password=account["initial_password"],
            role="student",
        ),
    )
    if phase != "initial":
        pair = await auth.login(db_session, account["username"], account["initial_password"])
        identity = await auth.authenticate(db_session, pair.access_token)
        await auth.change_password(
            db_session,
            identity,
            account["initial_password"],
            account["password"] if phase == "changed" else account["pending_password"],
        )

    if database:
        gateway = DatabaseGateway(db_session, None)
        await gateway.prepare_account(str(user.id), account)
    else:

        class InProcessAPI(seed_demo.API):
            def request(self, method, path, payload=None, expected=(200,)):
                async def send():
                    headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
                    return await db_client.request(
                        method, f"/api/v1/{path}", json=payload, headers=headers
                    )

                response = anyio.from_thread.run(send)
                if response.status_code not in expected:
                    raise seed_demo.APIError(method, path, response.status_code)
                return response.json() if response.content else None

        def prepare():
            import asyncio

            admin = InProcessAPI("http://test")
            admin.authenticate("admin", "admin", "admin-test-password")
            asyncio.run(HTTPGateway(admin, InProcessAPI).prepare_account(str(user.id), account))

        await anyio.to_thread.run_sync(prepare)
    response = await db_client.post(
        "/api/v1/auth/login",
        json={
            "username": account["username"],
            "password": account["pending_password"],
        },
    )
    assert response.status_code == 200
    assert response.json()["must_change_password"] is False


async def assert_learning_seed(session, result):
    from uuid import UUID

    from app.models import Assignment, Attempt, ScenarioCard, ScenarioVersion

    assert len(result["card_ids"]) == 2
    assert set(result["lessons"]) == {"operator_112", "dds"}
    seen_students = set()
    for role, lesson_ids in result["lessons"].items():
        assert set(lesson_ids) == {
            "introduction",
            "practice",
            "skill_practice",
            "review",
            "assessment",
        }
        skills = set()
        for kind, lesson_id in lesson_ids.items():
            lesson = await session.get(Lesson, UUID(lesson_id))
            assert lesson.status.value == "active" and lesson.ended_at is None
            assert lesson.learning["kind"] == kind
            assert (lesson.learning["assistance"]["max_level"] == "none") == (kind == "assessment")
            assert bool(lesson.learning["target_skills"]) == (kind in {"skill_practice", "review"})
            skills.update(lesson.learning["target_skills"])
            assignments = list(
                await session.scalars(select(Assignment).where(Assignment.lesson_id == lesson.id))
            )
            assert len(assignments) == 2
            for assignment in assignments:
                seen_students.add(assignment.student_id)
                scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
                assert scenario.role.value == role
                assert assignment.settings["learning_engine"] == "workflow-v1"
                assert (
                    await session.scalar(
                        select(Attempt.id).where(Attempt.assignment_id == assignment.id)
                    )
                    is None
                )
                source = await session.get(ScenarioCard, assignment.scenario_card_id)
                data = source.snapshot["data"]
                assert data["caller_name"] in source.snapshot["caller_message"]
                assert data["caller_phone"] in source.snapshot["caller_message"]
                assert data["address_details"]["street"] in source.snapshot["caller_message"]
        assert skills == (
            {"address", "caller", "classification", "notification", "description"}
            if role == "operator_112"
            else {"dds_crews", "dds_response"}
        )
    assert len(seen_students) == 1


@pytest.mark.anyio
async def test_add_learning_formats_to_existing_seed(
    db_session, tmp_path, monkeypatch, auth_settings
):
    from app.models import Assignment
    from scripts import seed_training
    from scripts.source_catalog import load_catalog, populate_database

    original = seed_training.populate_learning

    async def legacy_plan(*args):
        return {"card_ids": []}

    monkeypatch.setattr(seed_training, "populate_learning", legacy_plan)
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    catalog = await populate_database(db_session)
    state = seed_demo.State(tmp_path / "state.json", "http://local", "demo")
    gateway = seed_training.DatabaseGateway(db_session, admin)
    old = await seed_training.populate_training(
        gateway, state, catalog["classifier_id"], load_catalog(), recommendation_cards=0
    )
    assert await db_session.scalar(select(func.count()).select_from(Lesson)) == 3
    # An existing group can have other students; the new set is only for the seed student.
    extra = User(username="other-student", password_hash="test-only")
    db_session.add(extra)
    await db_session.flush()
    await gateway.enroll(state.data["ids"]["source-training-group"], str(extra.id))
    monkeypatch.setattr(seed_training, "populate_learning", original)
    new = await seed_training.populate_training(
        gateway, state, catalog["classifier_id"], load_catalog(), recommendation_cards=0
    )
    assert old["lesson_id"] == new["lesson_id"] and old["dds"] == new["dds"]
    assert await db_session.scalar(select(func.count()).select_from(Lesson)) == 13
    assert (
        await db_session.scalar(select(Assignment.id).where(Assignment.student_id == extra.id))
        is None
    )
    await assert_learning_seed(db_session, new["learning"])
    assert (
        await seed_training.populate_training(
            gateway, state, catalog["classifier_id"], load_catalog(), recommendation_cards=0
        )
        == new
    )
