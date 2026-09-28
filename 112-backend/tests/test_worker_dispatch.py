"""Each job purpose must reach its own inference implementation."""

from types import SimpleNamespace

import pytest

from app.models.enums import AIPurpose
from app.services import generation_worker as worker
from app.services.ai_jobs import handlers


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
        handlers.llm, "compose", inference(AIPurpose.GENERATION, ("card", {"mode": "test"}))
    )
    monkeypatch.setattr(
        handlers.assessment_inference, "evaluate", inference(AIPurpose.EVALUATION, "assessment")
    )
    monkeypatch.setattr(
        handlers.recommendation_inference, "evaluate", inference(AIPurpose.RECOMMENDATION, "advice")
    )
    monkeypatch.setattr(
        handlers.dds_inference, "compose", inference(AIPurpose.DDS_GENERATION, ("dds", {}))
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
    monkeypatch.setattr(handlers.recommendation_jobs, "prepare", recommendation)
    monkeypatch.setattr(handlers.memory_worker, "prepare", assessment)
    monkeypatch.setattr(handlers.generation_examples, "prepare", generation)
    monkeypatch.setattr(handlers.dds_examples, "prepare", dds)
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


@pytest.mark.anyio
@pytest.mark.parametrize("purpose", list(AIPurpose))
async def test_publication_dispatch_preserves_domain_transaction_boundary(monkeypatch, purpose):
    from unittest.mock import AsyncMock
    from uuid import uuid4

    job_id, token = uuid4(), "worker"
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(purpose=purpose)
    publishers = {
        AIPurpose.GENERATION: handlers.publication,
        AIPurpose.DDS_GENERATION: handlers.dds_jobs,
        AIPurpose.EVALUATION: handlers.assessment_jobs,
        AIPurpose.RECOMMENDATION: handlers.recommendation_jobs,
        AIPurpose.GROUP_RECOMMENDATION: handlers.group_reports,
    }
    mocks = {}
    for key, module in publishers.items():
        mocks[key] = AsyncMock(return_value=True)
        monkeypatch.setattr(module, "finish", mocks[key])
    assert await worker.finish(session, job_id, token, "output", {"trace": 1})
    for key, mock in mocks.items():
        if key == purpose:
            args = (session, job_id, token, "output")
            if key in {AIPurpose.GENERATION, AIPurpose.DDS_GENERATION}:
                args += ({"trace": 1},)
            mock.assert_awaited_once_with(*args)
        else:
            mock.assert_not_awaited()
    session.commit.assert_not_awaited()
    session.rollback.assert_not_awaited()


def test_all_purposes_are_registered_and_unknown_never_falls_back_to_generation():
    assert set(handlers.HANDLERS) == set(AIPurpose)
    with pytest.raises(KeyError):
        worker.call_model(SimpleNamespace(purpose="unknown"))
