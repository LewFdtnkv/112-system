from datetime import UTC, datetime
from uuid import uuid4

import pytest
from test_teacher_api import teaching as teaching

from app.models import AIJob, MessageRecipient, TeachingMessage

pytestmark = pytest.mark.anyio


async def test_unread_count_filter_and_read_are_scoped(teaching, db_client, db_session):
    t = teaching
    messages = [
        TeachingMessage(teacher_id=t.accounts["teacher"].id, text=f"Сообщение {i}")
        for i in range(24)
    ]
    job = AIJob(
        purpose="recommendation",
        student_id=t.accounts["student"].id,
        idempotency_key=uuid4(),
        prompt_version="test",
        input={},
    )
    db_session.add(job)
    await db_session.flush()
    advice = TeachingMessage(
        ai_job_id=job.id,
        text="Рекомендация",
        source="learning_advice",
        details={"role": "operator_112"},
    )
    messages.append(advice)
    db_session.add_all(messages)
    await db_session.flush()
    db_session.add_all(
        [MessageRecipient(message_id=m.id, student_id=t.accounts["student"].id) for m in messages]
    )
    db_session.add(
        MessageRecipient(
            message_id=messages[0].id,
            student_id=t.accounts["student2"].id,
            read_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    url = "/api/v1/student/messages"
    headers = t.headers["student"]
    summary = await db_client.get(url + "/summary", headers=headers)
    assert summary.status_code == 200 and summary.json() == {"unread_count": 25}
    inbox = (await db_client.get(url + "?unread_only=true", headers=headers)).json()
    assert len(inbox["items"]) == 20 and inbox["total"] == 25
    assert all(m["read_at"] is None for m in inbox["items"])
    second = (await db_client.get(url + "?unread_only=true&offset=20", headers=headers)).json()
    assert len(second["items"]) == 5
    teacher_only = (
        await db_client.get(url + "?unread_only=true&include_advice=false", headers=headers)
    ).json()
    assert teacher_only["total"] == 24
    target = str(messages[1].id)
    for _ in range(2):
        assert (await db_client.post(url + f"/{target}/read", headers=headers)).status_code == 204
    assert (await db_client.get(url + "/summary", headers=headers)).json() == {"unread_count": 24}
    assert (await db_client.get(url, headers=headers)).json()["total"] == 25
    unread = (await db_client.get(url + "?unread_only=true&limit=100", headers=headers)).json()
    assert unread["total"] == 24 and target not in {m["id"] for m in unread["items"]}
    assert (await db_client.get(url + "/summary", headers=t.headers["student2"])).json() == {
        "unread_count": 0
    }
    assert (
        await db_client.post(url + f"/{target}/read", headers=t.headers["student2"])
    ).status_code == 404
    assert (await db_client.get(url + "/summary")).status_code == 401
    for role in ("teacher", "admin"):
        assert (await db_client.get(url + "/summary", headers=t.headers[role])).status_code == 403
