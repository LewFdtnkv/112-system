from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_semantic_assessment import decision, fake_output, model_job
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import AIJob, AssessmentExample, LessonEvaluation
from app.services.assessment_memory.library import seed
from app.services.assessment_memory.retrieval import retrieve
from app.services.generation_worker import claim, finish
from app.services.semantic_assessment.inference import evaluate
from app.services.semantic_assessment.prompts import messages

pytestmark = pytest.mark.anyio
VECTOR = [1.0] + [0.0] * 1023


def example(**kwargs):
    return AssessmentExample(
        source_key=str(uuid4()),
        kind="text",
        role="operator_112",
        criterion_code="description",
        policy_version="semantic-v1",
        situation="Мужчина потерял сознание, дышит.",
        reference="",
        answer="Без сознания, дыхание есть.",
        verdict="correct",
        reason="Существенные сведения сохранены.",
        search_text="дыхание сознание",
        embedding=VECTOR,
        embedding_model="fixture-digest",
        embedded_at=datetime.now(UTC),
        **kwargs,
    )


async def test_pgvector_filters_scope_version_withdrawal_and_returns_exact_neighbors(
    db_session, teaching
):
    owner, other = teaching.accounts["teacher"].id, teaching.accounts["other"].id
    shared = example()
    own, foreign, inactive, wrong_model, wrong_role, wrong_policy, distant = (
        example(created_by_id=owner),
        example(created_by_id=other),
        example(active=False),
        example(),
        example(),
        example(),
        example(),
    )
    wrong_model.embedding_model = "different-weights"
    wrong_role.role = "dds"
    wrong_policy.policy_version = "other-rubric"
    distant.embedding = [-x for x in VECTOR]
    db_session.add_all(
        [shared, own, foreign, inactive, wrong_model, wrong_role, wrong_policy, distant]
    )
    await db_session.commit()
    criterion = model_job().input["criteria"][0]
    rows = await retrieve(db_session, criterion, VECTOR, "fixture-digest", teacher_id=owner)
    assert {r["id"] for r in rows} == {str(shared.id), str(own.id)}
    assert all(r["similarity"] == 1 for r in rows)
    assert {r["id"] for r in await retrieve(db_session, criterion, VECTOR, "fixture-digest")} == {
        str(shared.id)
    }


async def test_bootstrap_is_idempotent_and_does_not_republish_withdrawn_examples(db_session):
    assert await seed(db_session) == 25
    row = await db_session.scalar(select(AssessmentExample).limit(1))
    row.active = False
    await db_session.commit()
    assert await seed(db_session) == 0
    assert not row.active


def test_examples_are_separate_from_evidence_and_budget_is_bounded():
    job = model_job()
    sample = {
        "id": "memory",
        "condition": "Место ограждено.",
        "answer": "Есть ограждение.",
        "verdict": "correct",
        "reason": "Равнозначно.",
    }
    job.context = {"retrieval": {"status": "ready", "examples": {"description": [sample]}}}
    fake = decision().model_copy(update={"reference_quote": "Место ограждено"})
    result = evaluate(job, lambda *args: (fake, {}))
    assert not result["findings"][0]["applied"]  # A retrieved quote is not evidence.
    assert result["retrieval"]["used_examples"] == {"description": ["memory"]}
    c = job.input["criteria"][0] | {"_retrieved_examples": [sample]}
    assert "memory" not in messages(c, {}, False)[1]["content"]
    assert "Примеры из памяти" in messages(c, {}, False)[0]["content"]
    sample["reason"] = "X" * 9000
    result = evaluate(job, lambda *args: (decision(), {}))
    assert result["findings"][0]["applied"]
    assert result["retrieval"]["used_examples"] == {"description": []}


def test_dds_reports_only_examples_actually_in_the_prompt():
    job = model_job(kind="dds")
    examples = [
        {
            "id": f"memory-{index}",
            "condition": f"Исходная ситуация {index}",
            "answer": "Прибыли на место.",
            "verdict": "correct",
            "reason": "Понятное сообщение.",
        }
        for index in range(3)
    ]
    job.context = {"retrieval": {"status": "ready", "examples": {"description": examples}}}
    prompts = []

    def invoke(criterion, facts, model, verification=False):
        prompts.append(messages(criterion, facts, verification)[1]["content"])
        return decision(), {}

    result = evaluate(job, invoke)
    assert result["retrieval"]["used_examples"] == {"description": ["memory-0", "memory-1"]}
    assert len(prompts) == 2
    assert all("Исходная ситуация 2" not in prompt for prompt in prompts)
    assert all("Исходная ситуация 0" in prompt for prompt in prompts)


async def test_teacher_can_publish_replace_and_withdraw_but_not_change_grade(exercise, db_session):
    e = exercise
    attempt = await e.complete()
    job = await claim(db_session)
    assert await finish(db_session, job.id, job.worker_id, fake_output(job), {})
    path = (
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
        f"/attempts/{attempt['id']}/assessment-memory"
    )
    payload = {
        "request_id": str(uuid4()),
        "criterion_code": job.input["criteria"][0]["code"],
        "verdict": "correct",
        "reason": "Смысл сохранён, допустима другая формулировка.",
    }
    before = await db_session.scalar(select(func.count()).select_from(LessonEvaluation))
    await e.request("POST", path, payload, actor="student", status=403)
    await e.request("POST", path, payload, actor="other", status=404)
    first = await e.request("POST", path, payload, actor="teacher")
    retry = await e.request("POST", path, payload, actor="teacher")
    assert first["id"] == retry["id"] and first["active"]
    await e.request(
        "POST",
        path,
        payload | {"reason": "Другое несовместимое объяснение."},
        actor="teacher",
        status=409,
    )
    second = await e.request(
        "POST", path, payload | {"request_id": str(uuid4()), "verdict": "partial"}, actor="teacher"
    )
    rows = await e.request("GET", path, actor="teacher")
    assert len(rows) == 2 and sum(r["active"] for r in rows) == 1
    withdrawn = await e.request("DELETE", path + "/" + second["id"], actor="teacher")
    assert not withdrawn["active"]
    assert await db_session.scalar(select(func.count()).select_from(LessonEvaluation)) == before
    saved = await db_session.get(AssessmentExample, UUID(first["id"]))
    assert saved.created_by_id == e.t.accounts["teacher"].id
    assert saved.source_job_id == job.id and saved.embedding is None


async def test_worker_freezes_retrieval_and_records_unavailable_without_network(
    exercise, db_session, monkeypatch
):
    from contextlib import asynccontextmanager

    from app.services.assessment_memory import worker

    e = exercise
    await e.complete()
    job = await claim(db_session)

    @asynccontextmanager
    async def factory():
        yield db_session

    async def failed(*args, **kwargs):
        raise TimeoutError()

    monkeypatch.setattr(worker, "session_factory", factory)
    monkeypatch.setattr(worker, "index_pending", failed)
    await worker.prepare(job)
    assert job.context["retrieval"]["status"] == "unavailable"
    # The frozen bundle is reused; no repeated lookup on retry.
    monkeypatch.setattr(worker, "index_pending", lambda *args: pytest.fail("retrieval repeated"))
    await worker.prepare(job)
    assert (await db_session.get(AIJob, job.id)).context["retrieval"]["error"] == "TimeoutError"


async def test_library_disable_and_delete_are_scoped_and_reversible(db_session, teaching):
    from app.services.assessment_memory import catalog

    row = example()
    db_session.add(row)
    await db_session.commit()
    owner, other = teaching.accounts["teacher"].id, teaching.accounts["other"].id
    criterion = model_job().input["criteria"][0]
    await catalog.update(db_session, owner, row.id, enabled=False)
    assert not await retrieve(db_session, criterion, VECTOR, "fixture-digest", teacher_id=owner)
    assert await retrieve(db_session, criterion, VECTOR, "fixture-digest", teacher_id=other)
    page = await catalog.listing(db_session, owner, state="disabled")
    assert page.total == 1 and not page.items[0].enabled
    await catalog.update(db_session, owner, row.id, removed=True)
    assert (await catalog.listing(db_session, owner)).total == 0
    assert (await catalog.listing(db_session, owner, include_removed=True)).items[0].removed
    await catalog.update(db_session, owner, row.id, enabled=True)
    assert await retrieve(db_session, criterion, VECTOR, "fixture-digest", teacher_id=owner)
    assert (await db_session.get(AssessmentExample, row.id)).active


async def test_memory_library_api_pagination_and_permissions(exercise, db_session):
    e = exercise
    await seed(db_session)
    await e.request("GET", "assessment-memory", actor="student", status=403)
    result = await e.request("GET", "assessment-memory?limit=3&kind=dds", actor="teacher")
    assert result["total"] == 6 and len(result["items"]) == 3
    row = result["items"][0]
    assert row["source"] == "shared" and row["enabled"]
    updated = await e.request(
        "PATCH", "assessment-memory/" + row["id"], {"enabled": False}, actor="teacher"
    )
    assert not updated["enabled"]
    other = await e.request("GET", "assessment-memory?limit=100", actor="other")
    assert next(r for r in other["items"] if r["id"] == row["id"])["enabled"]
    await e.request("DELETE", "assessment-memory/" + row["id"], actor="teacher")
    remaining = await e.request("GET", "assessment-memory?limit=100", actor="teacher")
    assert all(r["id"] != row["id"] for r in remaining["items"])


async def test_worker_uses_frozen_examples_and_checks_result_provenance(
    exercise, db_session, monkeypatch
):
    from contextlib import asynccontextmanager

    from app.services.assessment_memory import worker
    from app.services.assessment_memory.retrieval import example_snapshot

    e = exercise
    await e.complete()
    job = await claim(db_session)
    row = example()
    db_session.add(row)
    await db_session.commit()

    @asynccontextmanager
    async def factory():
        yield db_session

    async def indexed(*args, **kwargs):
        return 0

    async def retrieved(*args, **kwargs):
        assert kwargs["teacher_id"] == e.t.accounts["teacher"].id
        return {
            "status": "ready",
            "embedding_model": "fixture-digest",
            "examples": {job.input["criteria"][0]["code"]: [example_snapshot(row)]},
        }

    monkeypatch.setattr(worker, "session_factory", factory)
    monkeypatch.setattr(worker, "index_pending", indexed)
    monkeypatch.setattr(worker, "retrieve_batch", retrieved)
    await worker.prepare(job)
    row.active = False
    await db_session.commit()
    output = evaluate(job, lambda *args: (decision(), {}))
    assert output["retrieval"]["used_examples"][job.input["criteria"][0]["code"]] == [str(row.id)]
    with pytest.raises(ValueError, match="retrieval snapshot"):
        await finish(db_session, job.id, job.worker_id, output | {"retrieval": {}}, {})
    assert await finish(db_session, job.id, job.worker_id, output, {})


def test_explicit_ambiguity_and_quote_options_do_not_import_retrieved_evidence():
    from app.services.semantic_assessment.evidence import explicitly_conflicting, response_schema

    assert explicitly_conflicting("Сведения двух очевидцев противоречат друг другу.")
    assert explicitly_conflicting("Получены взаимоисключающие сообщения.")
    assert not explicitly_conflicting("Сведения не противоречат друг другу.")
    assert not explicitly_conflicting("О наличии людей неизвестно.")
    criterion = model_job().input["criteria"][0]
    criterion["_retrieved_examples"] = [{"condition": "Посторонние факты из памяти"}]
    schema = response_schema(criterion)
    assert all(q in criterion["situation"] for q in schema["properties"]["reference_quote"]["enum"])
    assert all(q in criterion["answer"] for q in schema["properties"]["answer_quote"]["enum"])


@pytest.mark.parametrize("field", ["situation", "reference"])
def test_explicitly_conflicting_source_cannot_be_automatically_penalized(field):
    job = model_job()
    job.input["criteria"][0][field] = "Сведения очевидцев противоречат друг другу."
    result = evaluate(job, lambda *args: pytest.fail("Ambiguous source must not invoke LLM"))
    finding = result["findings"][0]
    assert finding["verdict"] == "uncertain" and not finding["applied"]
    assert finding["credit"] is None
