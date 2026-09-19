from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import AttemptEvent, Evaluation
from app.schemas.assessment import AIAssessmentOutput
from app.services.ai_assessment_contract import validate_ai_decision

pytestmark = pytest.mark.anyio


async def test_server_audit_browser_observations_and_pagination(exercise):
    e = exercise
    first = await e.start()
    path = f"student/attempts/{first['id']}"
    event = {
        "command_id": str(uuid4()),
        "kind": "ui.field_changed",
        "client_occurred_at": datetime.now(UTC).isoformat(),
        "field": "address.house",
        "value": "7",
    }
    await e.request("POST", f"{path}/observations", {"events": [event, event]})
    await e.request("POST", f"{path}/observations", {"events": [event]})
    await e.request(
        "POST", f"{path}/observations", {"events": [event | {"value": "8"}]}, status=409
    )
    await e.request(
        "POST", f"{path}/observations", {"events": [event | {"kind": "card.notified"}]}, status=422
    )
    await e.request(
        "POST", f"{path}/observations", {"events": [event | {"field": "password"}]}, status=422
    )
    await e.request(
        "POST", f"{path}/observations", {"events": [event]}, actor="student2", status=404
    )
    await e.request("POST", f"{path}/submit", {"revision": 1}, status=422)
    filled = await e.fill(first)
    await e.request("POST", f"{path}/submit", {"revision": filled["card"]["revision"]})
    teacher_path = (
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/attempts/{first['id']}"
    )
    rows, after = [], 0
    while True:
        page = await e.request(
            "GET", f"{teacher_path}/events?after={after}&limit=2", actor="teacher"
        )
        rows.extend(page["items"])
        if page["next_sequence"] is None:
            break
        after = page["next_sequence"]
    assert [row["sequence"] for row in rows] == list(range(1, 7))
    assert [row["kind"] for row in rows] == [
        "attempt.started",
        "ui.field_changed",
        "command.rejected",
        "card.draft_saved",
        "card.notified",
        "assessment.rules_completed",
    ]
    assert rows[1]["payload"]["trusted"] is False
    assert any(
        c["field"] == "description" and c["before"] is None for c in rows[3]["payload"]["changes"]
    )
    for actor, status in (("student", 403), ("admin", 403), ("other", 404)):
        await e.request("GET", f"{teacher_path}/events", actor=actor, status=status)
        await e.request("GET", f"{teacher_path}/assessment-context", actor=actor, status=status)


async def test_frozen_ai_contract_rejects_forged_or_unrelated_evidence(exercise, db_session):
    e = exercise
    first = await e.complete()
    path = (
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
        f"/attempts/{first['id']}/assessment-context"
    )
    context = await e.request("GET", path, actor="teacher")
    assert context["ai_connected"] is False
    assert context["reference"]["data"]["description"] == "HIDDEN_TEACHER_ANSWER"
    assert context["audit_through_sequence"] == 3
    assert len(context["audit"]["items"]) == 3
    evaluation = await db_session.get(Evaluation, UUID(context["evaluation_id"]))
    body = {
        "contract_version": "assessment-ai-v1",
        "attempt_id": first["id"],
        "context_hash": context["context_hash"],
        "model_version": "test-model",
        "prompt_version": "test-prompt",
        "completed_at": datetime.now(UTC).isoformat(),
        "criteria": [
            {
                "code": code,
                "decision": "satisfied",
                "credit": 1,
                "confidence": 0.9,
                "explanation": "Test",
                "evidence_field_paths": [f"submitted_card.data.{code}"],
            }
            for code in context["unverified_fields"]
        ],
    }
    output = AIAssessmentOutput.model_validate(body)
    assert await validate_ai_decision(db_session, output, evaluation) == output
    for patch in (
        {"attempt_id": str(uuid4())},
        {"context_hash": "0" * 64},
        {"criteria": [body["criteria"][0] | {"code": "classifier_entry_id"}]},
    ):
        with pytest.raises(ValueError):
            await validate_ai_decision(
                db_session, AIAssessmentOutput.model_validate(body | patch), evaluation
            )
    unknown = AIAssessmentOutput.model_validate(body)
    unknown.criteria[0].evidence_event_ids = [uuid4()]
    with pytest.raises(ValueError, match="authoritative events"):
        await validate_ai_decision(db_session, unknown, evaluation)
    late = await db_session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.attempt_id == UUID(first["id"]),
            AttemptEvent.kind == "assessment.rules_completed",
        )
    )
    unknown.criteria[0].evidence_event_ids = [late.id]
    with pytest.raises(ValueError, match="authoritative events"):
        await validate_ai_decision(db_session, unknown, evaluation)
