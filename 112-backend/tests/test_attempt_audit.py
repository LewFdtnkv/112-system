from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.services.generation_worker import claim, finish

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


async def test_frozen_context_excludes_late_observations_and_rejects_tampering(
    exercise, db_session
):
    e = exercise
    first = await e.complete()
    path = (
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
        f"/attempts/{first['id']}/assessment-context"
    )
    context = await e.request("GET", path, actor="teacher")
    assert context["ai_connected"] is True
    assert context["semantic_review"]["status"] == "queued"
    assert context["reference"]["data"]["description"] == "HIDDEN_TEACHER_ANSWER"
    assert context["audit_through_sequence"] == 3
    assert len(context["audit"]["items"]) == 3
    await e.request(
        "POST",
        f"student/attempts/{first['id']}/observations",
        {
            "events": [
                {
                    "command_id": str(uuid4()),
                    "kind": "ui.field_changed",
                    "client_occurred_at": datetime.now(UTC).isoformat(),
                    "field": "description",
                    "value": "late",
                }
            ]
        },
    )
    again = await e.request("GET", path, actor="teacher")
    assert again["semantic_input"] == context["semantic_input"]
    assert again["audit"] == context["audit"]
    job = await claim(db_session)
    assert job.attempt_id == UUID(first["id"])
    job.input = job.input | {"context_hash": "0" * 64}
    await db_session.commit()
    with pytest.raises(ValueError, match="context changed"):
        await finish(db_session, job.id, job.worker_id, {"findings": []}, {})
