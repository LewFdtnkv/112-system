from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import AIJob
from app.models.enums import AIPurpose, JobStatus

pytestmark = pytest.mark.anyio


async def test_admin_monitor_counts_filters_details_and_role_boundaries(
    exercise, db_session, db_client
):
    t = exercise.t
    attempt = await exercise.start()
    now = datetime.now(UTC)
    jobs = []
    for index, status in enumerate(JobStatus):
        job = AIJob(
            purpose=AIPurpose.EVALUATION
            if status == JobStatus.SUCCEEDED
            else AIPurpose.RECOMMENDATION
            if status == JobStatus.FAILED
            else AIPurpose.GENERATION,
            status=status,
            created_by_id=t.accounts["teacher" if index % 2 else "other"].id,
            student_id=t.accounts["student"].id,
            attempt_id=UUID(attempt["id"]) if status == JobStatus.SUCCEEDED else None,
            idempotency_key=uuid4(),
            prompt_version="test-prompt",
            model_version="qwen-test",
            created_at=now + timedelta(seconds=index),
            available_at=now,
            worker_id="private-lease-token" if status == JobStatus.RUNNING else None,
            lease_expires_at=now - timedelta(seconds=10) if status == JobStatus.RUNNING else None,
            completed_at=now + timedelta(seconds=15) if index >= 2 else None,
            retry_count=index,
            input={"hidden_reference": "REFERENCE_DATA" * 1000},
            context={"snapshot": "context"},
            output={"inference": {"source": "template-fallback"}, "text": "RESULT_DATA"}
            if index >= 2
            else None,
            error="Ошибка модели: " + ("x" * 400) if status == JobStatus.FAILED else None,
        )
        db_session.add(job)
        jobs.append(job)
    await db_session.commit()
    base = "/api/v1/admin/ai-jobs"
    for suffix in ["", f"/{jobs[0].id}"]:
        assert (await db_client.get(base + suffix)).status_code == 401
        for role in ("teacher", "other", "student"):
            response = await db_client.get(base + suffix, headers=t.headers[role])
            assert response.status_code == 403
            assert "REFERENCE_DATA" not in response.text
    headers = t.headers["admin"]
    response = await db_client.get(base, headers=headers, params={"limit": 2})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    page = response.json()
    assert page["summary"] == {"queued": 1, "running": 1, "succeeded": 1, "failed": 1}
    assert page["total"] == 4 and len(page["items"]) == 2
    assert page["items"][0]["id"] == str(jobs[-1].id)
    assert len(page["items"][0]["error_summary"]) == 240
    assert not {"input", "output", "context", "worker_id"} & page["items"][0].keys()
    assert "REFERENCE_DATA" not in response.text and "RESULT_DATA" not in response.text
    filtered = (
        await db_client.get(
            base,
            headers=headers,
            params={"status": "running", "purpose": "generation", "offset": 100},
        )
    ).json()
    assert filtered["total"] == 1 and filtered["offset"] == 0
    assert filtered["summary"] == page["summary"]
    assert filtered["items"][0]["lease_expired"]
    detail = await db_client.get(f"{base}/{jobs[-1].id}", headers=headers)
    assert detail.status_code == 200
    data = detail.json()
    assert data["input"] == jobs[-1].input and data["output"] == jobs[-1].output
    assert len(data["error"]) > 240 and "worker_id" not in data
    assert (await db_client.get(f"{base}/{uuid4()}", headers=headers)).status_code == 404
    found = (await db_client.get(base, headers=headers, params={"q": str(jobs[1].id)})).json()
    assert found["total"] == 1
    found = (
        await db_client.get(base, headers=headers, params={"q": t.accounts["other"].username})
    ).json()
    assert found["total"] == 2
    found = (await db_client.get(base, headers=headers, params={"q": "%"})).json()
    assert found["total"] == 0 and found["summary"] == page["summary"]
    for params in (
        {"status": "unknown"},
        {"purpose": "unknown"},
        {"offset": 2**63},
        {"limit": 0},
        {"q": "x" * 201},
    ):
        assert (await db_client.get(base, headers=headers, params=params)).status_code == 422
    # Reads do not take over or requeue a worker's task.
    await db_session.refresh(jobs[1])
    assert jobs[1].status == JobStatus.RUNNING and jobs[1].worker_id == "private-lease-token"


async def test_empty_monitor_and_password_change_gate(teaching, db_client, db_session):
    headers = teaching.headers["admin"]
    r = await db_client.get("/api/v1/admin/ai-jobs", headers=headers)
    assert r.status_code == 200
    assert r.json()["items"] == [] and r.json()["total"] == 0
    assert r.json()["summary"] == {"queued": 0, "running": 0, "succeeded": 0, "failed": 0}
    teaching.accounts["admin"].must_change_password = True
    await db_session.commit()
    assert (await db_client.get("/api/v1/admin/ai-jobs", headers=headers)).status_code == 403
