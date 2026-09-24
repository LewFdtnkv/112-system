"""Real-model smoke evaluation; all database writes are rolled back on a separate test DB."""

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import monotonic
from types import SimpleNamespace
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import SecretStr  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models import AIJob, TeachingMessage, User  # noqa: E402
from app.services.generation_worker import claim  # noqa: E402
from app.services.learning_recommendations.inference import evaluate  # noqa: E402
from app.services.learning_recommendations.jobs import enqueue, finish, render  # noqa: E402
from app.services.learning_recommendations.materials import retrieve  # noqa: E402
from app.services.learning_recommendations.profile import aggregate  # noqa: E402
from scripts.seed_demo import State  # noqa: E402
from scripts.seed_training import DatabaseGateway, populate_training  # noqa: E402
from scripts.source_catalog import load_catalog, populate_database  # noqa: E402


async def measure(session, job, name):
    started = monotonic()
    job.context = {"materials": await retrieve(session, job.input["profile"])}
    result = await asyncio.to_thread(evaluate, job)
    selected = [
        m for m in job.context["materials"]["examples"] if m["id"] in result["selected_ids"]
    ]
    return result, {
        "case": name,
        "seconds": round(monotonic() - started, 2),
        "retrieval": job.context["materials"]["status"],
        "profile": {k: v for k, v in job.input["profile"].items() if k != "sources"},
        "result": result,
        "message": render(job.input["profile"], selected),
    }


async def run(args):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise ValueError("TEST_DATABASE_URL must point to a migrated isolated test database")
    settings.jwt_secret_key = SecretStr("evaluation-only-key-not-for-production-112-study-advice")
    args.work_directory.mkdir(parents=True, exist_ok=True)
    engine = create_async_engine(url)
    reports = []
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                async with AsyncSession(
                    bind=connection,
                    expire_on_commit=False,
                    join_transaction_mode="create_savepoint",
                ) as session:
                    catalog = await populate_database(session)
                    admin = await session.scalar(select(User).where(User.is_admin.is_(True)))
                    state = State(args.work_directory / "state.json", "http://test", "advice-eval")
                    # Fresh state each time; the previous run's DB transaction was rolled back.
                    state.data["ids"] = {}
                    await populate_training(
                        DatabaseGateway(session, admin),
                        state,
                        catalog["classifier_id"],
                        load_catalog(),
                        recommendation_cards=6,
                    )
                    student_id = UUID(state.data["ids"]["source-training-student"])
                    job = await enqueue(session, student_id, "operator_112")
                    for other in await session.scalars(select(AIJob).where(AIJob.id != job.id)):
                        other.status = "failed"  # Isolated test data, not the working queue.
                    await session.commit()
                    job = await claim(session)
                    job.lease_expires_at = datetime.now(UTC) + timedelta(minutes=10)
                    result, report = await measure(session, job, "seed_address_errors")
                    args.output.write_text(
                        json.dumps([report], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                    )
                    # This rollback-only evaluation has one DB connection, so it cannot
                    # run the production worker's separate-session heartbeat.
                    job.lease_expires_at = datetime.now(UTC) + timedelta(minutes=2)
                    await session.commit()
                    assert await finish(session, job.id, job.worker_id, result)
                    message = await session.scalar(
                        select(TeachingMessage).where(TeachingMessage.ai_job_id == job.id)
                    )
                    assert message and "расхождениями — 4" in message.text
                    report["publication"] = job.output["publication"]
                    reports.append(report)
                    if args.seed_only:
                        args.output.write_text(
                            json.dumps(reports, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8",
                        )
                        return
                    for name, skill, credits, assisted in [
                        ("correct_with_help", "caller", [1] * 6, True),
                        ("dds_regression", "dds_response", [1, 1, 1, 0, 0, 0], False),
                    ]:
                        profile = aggregate(
                            [
                                {
                                    "lesson_id": str(i // 2),
                                    "assisted": assisted,
                                    "credits": {skill: credit},
                                }
                                for i, credit in enumerate(credits)
                            ]
                        )
                        sample = SimpleNamespace(
                            input={"profile": profile}, context={}, model_version=job.model_version
                        )
                        _, report = await measure(session, sample, name)
                        reports.append(report)
                        args.output.write_text(
                            json.dumps(reports, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8",
                        )
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
    print(
        json.dumps(
            [
                {k: r[k] for k in ("case", "seconds", "retrieval")} | {"mode": r["result"]["mode"]}
                for r in reports
            ],
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--work-directory", type=Path, required=True)
    parser.add_argument("--seed-only", action="store_true")
    asyncio.run(run(parser.parse_args()))
