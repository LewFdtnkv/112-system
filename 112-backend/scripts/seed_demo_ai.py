"""Queue real generation jobs; the regular worker schedules advice after grading."""

from uuid import NAMESPACE_URL, UUID, uuid5

from app.models import CardTemplate
from app.schemas.dds_generation import DDSGenerationCreate
from app.schemas.generation import GenerationCreate, GenerationParameters
from app.services import card_generation
from app.services.dds_generation import jobs as dds_jobs


async def populate_ai(gateway, state, source, dds_card_id, training):
    session = gateway.session
    jobs = []
    for message_format in ("call", "sms"):
        reads = await card_generation.enqueue(
            session,
            gateway.teacher.id,
            GenerationCreate(
                request_id=uuid5(NAMESPACE_URL, f"full-demo-v2/{source.id}/{message_format}"),
                parameters=GenerationParameters(
                    mode="assisted",
                    message_format=message_format,
                    caller_information="full" if message_format == "call" else "anonymous",
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
        jobs.extend(str(job.id) for job in reads)

    card = await session.get(CardTemplate, UUID(dds_card_id))
    # Preserve the original revision for a retry after the worker has already finished.
    payload = state.data.setdefault(
        "full-demo-v2-dds-request",
        {
            "request_id": str(uuid5(NAMESPACE_URL, f"full-demo-v2/dds/{card.id}")),
            "revision": card.revision,
            "service_profile_id": training["dds"]["profile_id"],
            "crew_codes": ["fire-1"],
            "initial_status": "unassigned",
            "target_status": "completed",
        },
    )
    state.save()
    job = await dds_jobs.enqueue(
        session, gateway.teacher.id, card.id, DDSGenerationCreate.model_validate(payload)
    )
    jobs.append(str(job.id))
    return {
        "generation_job_ids": jobs,
        "recommendations": "worker_after_assessment",
    }
