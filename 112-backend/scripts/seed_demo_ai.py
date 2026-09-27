"""Offline generation uses validated templates; sample assessments are labelled fixtures."""

from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.models import AIJob, CardTemplate, MessageRecipient, TeachingMessage
from app.schemas.dds_generation import DDSGenerationCreate
from app.schemas.generation import GenerationCreate, GenerationParameters
from app.services import card_generation, generation_worker
from app.services.dds_generation import jobs as dds_jobs
from app.services.generation.narration import fallback
from app.services.learning_recommendations import jobs as advice_jobs
from app.services.learning_recommendations.materials import retrieve


class AtomicSession:
    """Keep enqueue + terminal offline result invisible to workers until both are ready."""

    def __init__(self, session):
        self.session = session

    def __getattr__(self, name):
        return getattr(self.session, name)

    async def commit(self):
        await self.session.flush()


def lease(job):
    job.model_version = "demo-fixture/no-model"
    job.context = job.context | {"demo_fixture": True}
    job.status, job.worker_id = "running", "demo-seed"
    job.lease_expires_at = datetime.now(UTC) + timedelta(minutes=5)


async def populate_ai(gateway, state, source, student_ids, training):
    session = gateway.session
    atomic = AtomicSession(session)
    jobs = []
    for mode in ("success", "failed", "dds"):
        request_id = uuid5(NAMESPACE_URL, f"full-demo/{source.id}/generation/{mode}")
        reads = await card_generation.enqueue(
            atomic,
            gateway.teacher.id,
            GenerationCreate(
                request_id=request_id,
                parameters=GenerationParameters(
                    mode="template",
                    has_victims=False,
                    victims_count=0,
                    refused_ambulance=False,
                    blocked=False,
                    classifier_version_id=source.classifier_version_id,
                    classifier_entry_id=source.classifier_entry_id,
                    feature_answers=source.data["features"]["ekp"],
                ),
            ),
        )
        job = await session.get(AIJob, reads[0].id)
        if job.status in {"queued", "running"}:
            lease(job)
            if mode == "failed":
                job.status, job.worker_id, job.lease_expires_at = "failed", None, None
                job.completed_at = datetime.now(UTC)
                job.error = "Демонстрационный сбой генерации. Можно проверить повторный запуск."
            else:
                await atomic.flush()
                await generation_worker.finish(
                    atomic,
                    job.id,
                    "demo-seed",
                    fallback(job.input),
                    {
                        "source": "template",
                        "demo_fixture": True,
                        "quality_note": "Демонстрационная заготовка; модель не вызывалась.",
                        "selection": job.input["narrative"]["default_wording"],
                    },
                )
            await session.commit()
        jobs.append(str(job.id))
        if mode == "dds":
            card = await session.get(CardTemplate, job.card_template_id)
            # Stable request and original revision are required for interrupted-run replay.
            marker = "full-demo-dds-request"
            payload = state.data.setdefault(
                marker,
                {
                    "request_id": str(request_id),
                    "revision": card.revision,
                    "service_profile_id": training["dds"]["profile_id"],
                    "crew_codes": ["fire-1"],
                    "initial_status": "unassigned",
                    "target_status": "completed",
                },
            )
            state.save()
            dds = await dds_jobs.enqueue(
                atomic, gateway.teacher.id, card.id, DDSGenerationCreate.model_validate(payload)
            )
            if dds.status in {"queued", "running"}:
                from app.schemas.dds_generation import DDSNarration
                from app.services.dds_generation.inference import assemble

                lease(dds)
                await atomic.flush()
                narration = DDSNarration(
                    entries=[
                        {"key": slot["key"], "text": slot["meaning"]}
                        for slot in dds.input["plan"]["slots"]
                    ]
                )
                await dds_jobs.finish(
                    atomic,
                    dds.id,
                    "demo-seed",
                    assemble(dds.input["plan"], narration),
                    {
                        "source": "template",
                        "demo_fixture": True,
                        "quality_note": "Демонстрационная заготовка без модели.",
                    },
                )
                await session.commit()
            jobs.append(str(dds.id))

    for student_id in student_ids[:3]:
        for role in ("operator_112", "dds"):
            job = await advice_jobs.enqueue(session, UUID(student_id), role)
            if job is None:
                continue
            bundle = await retrieve(session, job.input["profile"], vectors=False)
            job.context = {"materials": bundle, "demo_fixture": True}
            lease(job)
            choices = {}
            for item in bundle["examples"]:
                choices.setdefault(item["skill"], item["id"])
            await session.flush()
            await advice_jobs.finish(
                atomic,
                job.id,
                "demo-seed",
                {
                    "selected_ids": list(choices.values()),
                    "mode": "methodical_fallback",
                    "demo_fixture": True,
                },
            )
            if job.output.get("message_id"):
                message = await session.get(TeachingMessage, UUID(job.output["message_id"]))
                message.text = "Демонстрационная рекомендация (без вызова ИИ).\n\n" + message.text
                message.details = message.details | {"demo_fixture": True}
            await session.commit()
    # Recover already published messages after a process interruption before the state write.
    advice = list(
        await session.scalars(
            select(TeachingMessage.id)
            .join(MessageRecipient)
            .where(
                MessageRecipient.student_id.in_([UUID(value) for value in student_ids[:3]]),
                TeachingMessage.source == "learning_advice",
                TeachingMessage.details["demo_fixture"].as_boolean().is_(True),
            )
            .order_by(TeachingMessage.id)
        )
    )
    return {"generation_job_ids": jobs, "advice_message_ids": [str(value) for value in advice]}
