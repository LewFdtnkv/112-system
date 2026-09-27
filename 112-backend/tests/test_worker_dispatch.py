"""Each job purpose must reach its own inference implementation."""

from types import SimpleNamespace

import pytest

from app.models.enums import AIPurpose
from app.services import generation_worker as worker


@pytest.mark.parametrize("purpose", list(AIPurpose))
def test_worker_dispatches_generation_assessment_and_recommendations(monkeypatch, purpose):
    job = SimpleNamespace(purpose=purpose)
    calls = []

    def inference(kind, result):
        def evaluate(received):
            assert received is job
            calls.append(kind)
            return result

        return evaluate

    monkeypatch.setattr(
        worker, "compose", inference(AIPurpose.GENERATION, ("card", {"mode": "test"}))
    )
    monkeypatch.setattr(
        worker.assessment_inference, "evaluate", inference(AIPurpose.EVALUATION, "assessment")
    )
    monkeypatch.setattr(
        worker.recommendation_inference, "evaluate", inference(AIPurpose.RECOMMENDATION, "advice")
    )
    monkeypatch.setattr(
        worker.dds_inference, "compose", inference(AIPurpose.DDS_GENERATION, ("dds", {}))
    )
    assert (
        worker.call_model(job)
        == {
            AIPurpose.GENERATION: ("card", {"mode": "test"}),
            AIPurpose.DDS_GENERATION: ("dds", {}),
            AIPurpose.EVALUATION: ("assessment", {}),
            AIPurpose.RECOMMENDATION: ("advice", {}),
            AIPurpose.GROUP_RECOMMENDATION: ("advice", {}),
        }[purpose]
    )
    assert calls == [
        AIPurpose.RECOMMENDATION if purpose == AIPurpose.GROUP_RECOMMENDATION else purpose
    ]


@pytest.mark.anyio
@pytest.mark.parametrize("purpose", list(AIPurpose))
async def test_worker_prepares_only_the_context_required_by_its_job(monkeypatch, purpose):
    import asyncio
    from contextlib import asynccontextmanager
    from unittest.mock import AsyncMock
    from uuid import uuid4

    job = SimpleNamespace(id=uuid4(), worker_id=uuid4(), purpose=purpose)
    session = object()

    @asynccontextmanager
    async def session_factory():
        yield session

    async def heartbeat(*args):
        await asyncio.Event().wait()

    recommendation = AsyncMock()
    assessment = AsyncMock()
    generation = AsyncMock()
    dds = AsyncMock()
    finished, failed = AsyncMock(), AsyncMock()
    monkeypatch.setattr(worker.recommendation_jobs, "prepare", recommendation)
    monkeypatch.setattr(worker.memory_worker, "prepare", assessment)
    monkeypatch.setattr(worker.generation_examples, "prepare", generation)
    monkeypatch.setattr(worker.dds_examples, "prepare", dds)
    monkeypatch.setattr(worker, "session_factory", session_factory)
    monkeypatch.setattr(worker, "heartbeat", heartbeat)
    monkeypatch.setattr(worker, "call_model", lambda value: ("result", {}))
    monkeypatch.setattr(worker, "finish", finished)
    monkeypatch.setattr(worker, "fail", failed)
    await worker.process(job)
    assert recommendation.await_count == (
        purpose in {AIPurpose.RECOMMENDATION, AIPurpose.GROUP_RECOMMENDATION}
    )
    assert assessment.await_count == (purpose == AIPurpose.EVALUATION)
    assert generation.await_count == (purpose == AIPurpose.GENERATION)
    assert dds.await_count == (purpose == AIPurpose.DDS_GENERATION)
    finished.assert_awaited_once_with(session, job.id, job.worker_id, "result", {})
    failed.assert_not_awaited()
