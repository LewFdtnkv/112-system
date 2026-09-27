from copy import deepcopy
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from test_catalog_dds import api as api
from test_teacher_api import teaching as teaching

from app.models import AIJob, CardTemplate
from app.models.enums import JobStatus
from app.schemas.dds_generation import DDSNarration, DDSReview
from app.services import generation_worker as worker
from app.services.dds_generation import examples, inference

pytestmark = pytest.mark.anyio


async def enqueue(t, **overrides):
    card = await t.post("cards", t.card_payload)
    request = {
        "request_id": str(uuid4()),
        "revision": 1,
        "service_profile_id": str(t.profile.id),
        "initial_status": "responding",
        "target_status": "completed",
        **overrides,
    }
    job = await t.post(f"cards/{card['id']}/dds-generations", request, expected=202)
    return card, request, job


def draft(job):
    return DDSNarration(
        entries=[{"key": s["key"], "text": s["meaning"]} for s in job.input["plan"]["slots"]]
    )


async def test_queue_atomic_success_and_fence(teaching, api):
    t = teaching
    card, request, result = await enqueue(t)
    duplicate = await t.post(f"cards/{card['id']}/dds-generations", request, expected=202)
    assert duplicate["id"] == result["id"]
    assert result["kind"] == "dds_generation"
    assert result["card_template_id"] == card["id"]
    job = await worker.claim(t.db_session)
    assert str(job.id) == result["id"]
    output = inference.assemble(job.input["plan"], draft(job))
    assert not await worker.finish(t.db_session, job.id, "old-worker", output, {})
    await t.db_session.refresh(job)
    assert await worker.finish(t.db_session, job.id, job.worker_id, output, {})
    after = await api("GET", f"cards/{card['id']}", actor="teacher")
    assert after["caller_message"] == card["caller_message"]
    assert after["data"] == card["data"]
    assert after["revision"] == 2
    assert after["dds_exercise"]["initial_crews"][0]["history"][-1]["status"] == "responding"
    assert len(after["dds_exercise"]["messages"]) == 3
    assert not after["generated_by_ai"]  # DDS is not base-card provenance.
    detail = await api("GET", f"admin/ai-jobs/{job.id}")
    assert detail["target_card_id"] == card["id"]
    assert detail["status"] == "succeeded"


async def test_critic_failure_preserves_card(teaching, monkeypatch):
    card, _, result = await enqueue(teaching)
    job = await worker.claim(teaching.db_session)

    def model(model, prompt, schema, **kwargs):
        if schema is DDSNarration:
            return draft(job), {}
        return DDSReview(
            checked_keys=[s["key"] for s in job.input["plan"]["slots"]],
            contradictions=["Подмена выезда прибытием"],
            unsupported=[],
            missing=[],
        ), {}

    monkeypatch.setattr(inference, "request", model)
    with pytest.raises(inference.DDSGenerationFailure) as rejected:
        inference.compose(job)
    await worker.fail(teaching.db_session, job.id, job.worker_id, rejected.value)
    row = await teaching.db_session.get(CardTemplate, UUID(card["id"]))
    assert row.dds_exercise is None and row.revision == 1
    assert job.status == JobStatus.FAILED
    assert len(job.context["inference_failures"][0]["attempts"]) == 2


async def test_successful_retry_removes_old_failure_from_pending_list(teaching, api):
    t = teaching
    card, request, first = await enqueue(t)
    failed = await worker.claim(t.db_session)
    await worker.fail(t.db_session, failed.id, failed.worker_id, inference.DDSGenerationFailure({}))
    path = f"cards/{card['id']}/dds-generations"
    pending_path = "card-generations?pending_only=true&limit=1&offset=10"
    assert (await api("GET", pending_path, actor="teacher"))["total"] == 1

    second = await t.post(path, request | {"request_id": str(uuid4())}, expected=202)
    succeeded = await worker.claim(t.db_session)
    # Explicit chronology also works inside the fixture's single DB transaction.
    succeeded.created_at = failed.created_at + timedelta(seconds=1)
    await worker.finish(
        t.db_session,
        succeeded.id,
        succeeded.worker_id,
        inference.assemble(succeeded.input["plan"], draft(succeeded)),
        {},
    )
    pending = await api("GET", pending_path, actor="teacher")
    assert pending["items"] == []
    assert pending["total"] == 0 and pending["offset"] == 0
    history = await api("GET", path, actor="teacher")
    assert [j["id"] for j in history] == [second["id"], first["id"]]
    assert [j["status"] for j in history] == ["succeeded", "failed"]
    assert (await api("GET", "card-generations", actor="teacher"))["total"] == 2
    assert (await api("GET", f"admin/ai-jobs/{first['id']}"))["status"] == "failed"

    # A later failed replacement is still relevant, even with a ready exercise.
    replacement = await t.post(
        path,
        request | {"request_id": str(uuid4()), "revision": 2, "replace_existing": True},
        expected=202,
    )
    latest = await worker.claim(t.db_session)
    latest.created_at = succeeded.created_at + timedelta(seconds=1)
    await worker.fail(t.db_session, latest.id, latest.worker_id, inference.DDSGenerationFailure({}))
    pending = await api("GET", pending_path, actor="teacher")
    assert [j["id"] for j in pending["items"]] == [replacement["id"]]
    assert pending["total"] == 1 and pending["offset"] == 0


async def test_success_does_not_hide_another_cards_failure(teaching, api):
    t = teaching
    _, _, first = await enqueue(t)
    failed = await worker.claim(t.db_session)
    await worker.fail(t.db_session, failed.id, failed.worker_id, inference.DDSGenerationFailure({}))
    await enqueue(t)
    succeeded = await worker.claim(t.db_session)
    succeeded.created_at = failed.created_at + timedelta(seconds=1)
    await worker.finish(
        t.db_session,
        succeeded.id,
        succeeded.worker_id,
        inference.assemble(succeeded.input["plan"], draft(succeeded)),
        {},
    )
    pending = await api("GET", "card-generations?pending_only=true", actor="teacher")
    assert [j["id"] for j in pending["items"]] == [first["id"]]
    assert pending["total"] == 1


@pytest.mark.parametrize("change", ["edit", "used"])
async def test_stale_or_used_card_is_not_overwritten(teaching, api, change):
    t = teaching
    card, _, _ = await enqueue(t)
    job = await worker.claim(t.db_session)
    if change == "edit":
        await api(
            "PUT",
            f"cards/{card['id']}",
            t.card_payload | {"revision": 1, "title": "Правка"},
            actor="teacher",
        )
    else:
        await t.post(
            "scenarios", {"title": "Использована", "role": "operator_112", "card_ids": [card["id"]]}
        )
    with pytest.raises(HTTPException) as rejected:
        await worker.finish(
            t.db_session,
            job.id,
            job.worker_id,
            inference.assemble(job.input["plan"], draft(job)),
            {},
        )
    assert rejected.value.status_code == 409
    await worker.fail(t.db_session, job.id, job.worker_id, rejected.value)
    row = await t.db_session.get(CardTemplate, UUID(card["id"]))
    assert row.dds_exercise is None
    assert job.status == JobStatus.FAILED


async def test_permissions_and_plan_validation(teaching, api):
    t = teaching
    card = await t.post("cards", t.card_payload)
    path = f"cards/{card['id']}/dds-generations"
    data = {"request_id": str(uuid4()), "revision": 1, "service_profile_id": str(t.profile.id)}
    for actor, status in [("student", 403), ("admin", 403), ("other", 404)]:
        await api("POST", path, data, actor=actor, status=status)
    for patch in [
        {"initial_status": "arrived", "target_status": "responding"},
        {"crew_codes": ["missing"]},
        {"crew_codes": ["main", "main"]},
        {"crew_calls_required": True},
        {"crew_codes": []},
        {"revision": True},
    ]:
        await api("POST", path, data | patch, actor="teacher", status=422)
    first = await api("POST", path, data, actor="teacher", status=202)
    await api("POST", path, data | {"target_status": "completed"}, actor="teacher", status=409)
    await api("POST", path, data | {"request_id": str(uuid4())}, actor="teacher", status=409)
    assert (await api("GET", path, actor="teacher"))[0]["id"] == first["id"]


async def test_retrieval_requires_approval_and_rechecks_it(teaching, api):
    t = teaching
    card, _, result = await enqueue(t)
    job = await t.db_session.get(AIJob, UUID(result["id"]))
    exercise = inference.assemble(job.input["plan"], draft(job)).model_dump(mode="json")
    example = await t.post("cards", t.card_payload | {"dds_exercise": exercise})
    assert all(e["source"] == "authored" for e in await examples.retrieve(t.db_session, job))
    await api(
        "PUT",
        f"cards/{example['id']}/generation-example",
        {"revision": 1, "enabled": True},
        actor="teacher",
    )
    retrieved = await examples.retrieve(t.db_session, job)
    assert retrieved[0]["source"] == "teacher"
    job = await worker.claim(t.db_session)
    await api(
        "PUT",
        f"cards/{example['id']}/generation-example",
        {"revision": 1, "enabled": False},
        actor="teacher",
    )
    with pytest.raises(ValueError, match="revoked"):
        await worker.finish(
            t.db_session,
            job.id,
            job.worker_id,
            inference.assemble(job.input["plan"], draft(job)),
            {"examples": retrieved},
        )
    assert (await t.db_session.get(CardTemplate, UUID(card["id"]))).dds_exercise is None


async def test_replacement_failure_keeps_previous_dds(teaching):
    t = teaching
    card, request, _ = await enqueue(t)
    job = await worker.claim(t.db_session)
    output = inference.assemble(job.input["plan"], draft(job))
    await worker.finish(t.db_session, job.id, job.worker_id, output, {})
    before = deepcopy((await t.db_session.get(CardTemplate, UUID(card["id"]))).dds_exercise)
    request |= {"request_id": str(uuid4()), "revision": 2}
    await t.post(f"cards/{card['id']}/dds-generations", request, expected=409)
    await t.post(
        f"cards/{card['id']}/dds-generations", request | {"replace_existing": True}, expected=202
    )
    job = await worker.claim(t.db_session)
    await worker.fail(t.db_session, job.id, job.worker_id, inference.DDSGenerationFailure({}))
    assert (await t.db_session.get(CardTemplate, UUID(card["id"]))).dds_exercise == before


async def test_dds_only_card_can_be_approved_as_example(teaching, api):
    t = teaching
    card, _, result = await enqueue(t)
    job = await t.db_session.get(AIJob, UUID(result["id"]))
    exercise = inference.assemble(job.input["plan"], draft(job)).model_dump(mode="json")
    example = await t.post(
        "cards", t.card_payload | {"caller_message": None, "dds_exercise": exercise}
    )
    approved = await api(
        "PUT",
        f"cards/{example['id']}/generation-example",
        {"revision": 1, "enabled": True},
        actor="teacher",
    )
    assert approved["generation_example"]


def test_model_schema_restricts_keys_and_rejects_duplicates():
    from types import SimpleNamespace

    plan = {"slots": [{"key": "m:main:0", "meaning": "Назначьте бригаду"}]}
    schema = inference.output_schema(plan)
    assert schema["$defs"]["Wording"]["properties"]["key"]["enum"] == ["m:main:0"]
    assert schema["properties"]["entries"]["maxItems"] == 1
    response = draft(SimpleNamespace(input={"plan": plan}))
    response.entries *= 2
    with pytest.raises(ValueError):
        inference.validate(response, plan)


async def test_prepared_crews_do_not_need_a_contact_for_a_new_call(teaching):
    _, _, job = await enqueue(teaching, crew_calls_required=True)
    assert job["status"] == "queued"


async def test_refusal_generation_requires_teacher_reason(teaching):
    t = teaching
    card = await t.post("cards", t.card_payload)
    payload = {
        "request_id": str(uuid4()),
        "revision": 1,
        "service_profile_id": str(t.profile.id),
        "initial_status": "assigned",
        "target_status": "not_accepted",
    }
    error = await t.post(f"cards/{card['id']}/dds-generations", payload, expected=422)
    assert error["detail"][0]["loc"] == ["body", "reason"]
    result = await t.post(
        f"cards/{card['id']}/dds-generations",
        payload | {"reason": "Нет оборудования для устранения утечки"},
        expected=202,
    )
    job = await t.db_session.get(AIJob, UUID(result["id"]))
    plan = job.input["plan"]
    assert plan["exercise"]["workflow"] == "crews-v2"
    assert "Нет оборудования" in plan["slots"][-1]["meaning"]
    output = inference.assemble(plan, draft(job))
    assert output.required_crews[0].status == "not_accepted"
