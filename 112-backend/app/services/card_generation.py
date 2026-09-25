"""Resolve training facts once; the model writes prose, never catalog IDs or routes."""

import hashlib
import random
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.config import settings
from app.models import AIJob, ClassifierEntry, ClassifierRoute, ClassifierVersion, Service, User
from app.models.enums import AIPurpose, JobStatus, PublicationStatus
from app.schemas.authoring import CardCreate
from app.schemas.generation import GenerationCreate, GenerationRead
from app.services import generation_flags
from app.services.authoring.cards import validate_card_definition
from app.services.catalog_rules import (
    applicable_routes,
    feature_definitions,
)
from app.services.generation import planner
from app.services.generation.evidence import extra_evidence
from app.services.generation.presentation import prepare_message, resolve_address, resolve_caller

PROMPT_VERSION = "card-generation-v5"
CHOICES = {
    "message_format": [
        {"value": "call", "label": "Телефонное сообщение"},
        {"value": "sms", "label": "СМС"},
    ],
    "caller_information": [
        {"value": "full", "label": "ФИО или ФИ, пол и возраст"},
        {"value": "name_only", "label": "Только имя"},
        {"value": "anonymous", "label": "Без сведений о заявителе"},
    ],
    "address_format": [
        {"value": "structured", "label": "Улица и номер дома"},
        {"value": "descriptive", "label": "Описательный адрес, ориентиры"},
    ],
    "object": ["жилой дом", "двор", "магазин", "дорога", "парк", "школа"],
    "gender": [{"value": "male", "label": "Мужской"}, {"value": "female", "label": "Женский"}],
    "time_of_day": [
        {"value": "morning", "label": "Утро"},
        {"value": "day", "label": "День"},
        {"value": "evening", "label": "Вечер"},
        {"value": "night", "label": "Ночь"},
    ],
    "caller_state": [
        {"value": "calm", "label": "Спокоен"},
        {"value": "worried", "label": "Взволнован"},
        {"value": "panicked", "label": "Паникует"},
    ],
    "detail_level": [
        {"value": "brief", "label": "Краткое сообщение"},
        {"value": "normal", "label": "Обычное сообщение"},
        {"value": "detailed", "label": "Подробное сообщение"},
    ],
}


def read_job(job):
    facts = job.input["facts"]
    return GenerationRead(
        id=job.id,
        status=job.status,
        created_at=job.created_at,
        completed_at=job.completed_at,
        card_template_id=job.card_template_id,
        title=job.input["card"]["title"],
        incident_name=facts["Тип происшествия"],
        address_text=facts["Адрес"],
        services=facts["Службы"],
        error=job.error,
        attempts=job.retry_count,
        facts=facts,
        template_name=job.input.get("narrative", {}).get("title"),
        generation_method=(job.output or {}).get("inference", {}).get("source"),
        quality_note=(job.output or {}).get("inference", {}).get("quality_note"),
    )


def pick(rng, field, fixed):
    if fixed is not None:
        return fixed
    value = rng.choice(CHOICES[field])
    return value["value"] if isinstance(value, dict) else value


def label(field, value):
    return next(row["label"] for row in CHOICES[field] if row["value"] == value)


async def enqueue(session, teacher_id: UUID, request: GenerationCreate):
    # Serialize enqueue/retry per teacher, including idempotency and quota checks.
    await session.scalar(select(User).where(User.id == teacher_id).with_for_update())
    fingerprint = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    keys = [
        uuid5(NAMESPACE_URL, f"{teacher_id}/{request.request_id}/{i}") for i in range(request.count)
    ]
    existing = list(await session.scalars(select(AIJob).where(AIJob.idempotency_key.in_(keys))))
    if existing:
        if len(existing) != request.count or any(
            j.context.get("fingerprint") != fingerprint for j in existing
        ):
            raise HTTPException(409, "Этот запрос уже зарегистрирован с другими параметрами")
        return [read_job(j) for j in sorted(existing, key=lambda j: j.context["position"])]
    pending = await session.scalar(
        select(func.count())
        .select_from(AIJob)
        .where(
            AIJob.created_by_id == teacher_id,
            AIJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        )
    )
    if pending + request.count > 30:
        raise HTTPException(
            409, "Дождитесь завершения предыдущих генераций (максимум 30 в очереди)"
        )
    p = request.parameters
    rng = random.Random(random.SystemRandom().getrandbits(128))
    versions = list(
        await session.scalars(
            select(ClassifierVersion).where(ClassifierVersion.status == PublicationStatus.PUBLISHED)
        )
    )
    if p.classifier_version_id:
        versions = [v for v in versions if v.id == p.classifier_version_id]
    if not versions:
        raise HTTPException(409, "Для генерации нужна опубликованная версия ЕКП")
    # A package shares one version, so all cards can be placed in one scenario.
    version = rng.choice(versions)
    entries = list(
        await session.scalars(
            select(ClassifierEntry).where(ClassifierEntry.classifier_version_id == version.id)
        )
    )
    if p.classifier_entry_id:
        entries = [e for e in entries if e.id == p.classifier_entry_id]
    if not entries:
        raise HTTPException(422, "В выбранной версии ЕКП нет подходящего типа происшествия")
    routes_by_entry = {e.id: [] for e in entries}
    for route in await session.scalars(
        select(ClassifierRoute).where(ClassifierRoute.entry_id.in_(routes_by_entry))
    ):
        routes_by_entry[route.entry_id].append(route)
    services = {
        s.id: s for s in await session.scalars(select(Service).where(Service.is_active.is_(True)))
    }
    if p.service_ids is not None and not set(p.service_ids) <= services.keys():
        raise HTTPException(422, "Выбранная служба отключена или не существует")
    if p.service_ids is not None and not p.classifier_entry_id:
        preferred = [
            e
            for e in entries
            if set(p.service_ids) == {r.service_id for r in routes_by_entry[e.id]}
        ]
        entries = preferred or entries

    recent = await session.scalars(
        select(AIJob)
        .where(AIJob.created_by_id == teacher_id)
        .order_by(AIJob.created_at.desc())
        .limit(50)
    )
    usage = {}
    for previous in recent:
        template_id = previous.input.get("narrative", {}).get("template_id")
        if template_id:
            usage[template_id] = usage.get(template_id, 0) + 1
    jobs = []
    for i, key in enumerate(keys):
        entry, plan = planner.choose(entries, p, rng, usage)
        definitions = feature_definitions(entry)
        prepare_message(plan, p, definitions, rng)
        answers = plan["answers"]
        flags, victims_count = plan["flags"], plan["victims_count"]
        plan["default_wording"] = {key: rng.randrange(2) for key in ("wording", "opening", "order")}
        plan["mode"] = p.mode
        if "phrases" in plan:
            rng.shuffle(plan["phrases"])
        recommended = applicable_routes(entry, routes_by_entry[entry.id], {"ekp": answers})
        service_ids = (
            p.service_ids if p.service_ids is not None else [r.service_id for r in recommended]
        )
        if not set(service_ids) <= services.keys():
            raise HTTPException(409, "Маршрут ЕКП содержит отключённую службу")

        name, gender_label, age, phone = resolve_caller(p, plan, rng)
        address, address_text = resolve_address(p, plan, rng)
        features = {f.label: answers[f.key] for f in definitions if f.key in answers}
        facts = {
            "Тип происшествия": entry.display_name or entry.name,
            "Формат сообщения": label("message_format", plan["message_format"]),
            "Адрес": address_text,
            "Объект": address.get("object"),
            "ФИО заявителя": name,
            "Пол": gender_label,
            "Возраст": age,
            "Учебный телефон": phone,
            "Признаки": features,
            "Отметки карточки": generation_flags.facts(flags, victims_count),
            "Службы": [services[s].short_name or services[s].name for s in service_ids],
            "Полные названия служб": [services[s].name for s in service_ids],
            **{
                title: label(field, pick(rng, field, getattr(p, field)))
                for field, title in (
                    ("time_of_day", "Время суток"),
                    ("caller_state", "Состояние заявителя"),
                    ("detail_level", "Подробность сообщения"),
                )
            },
        }
        card = CardCreate(
            title=plan["title"],
            classifier_version_id=version.id,
            classifier_entry_id=entry.id,
            instructions="",
            data={
                "description": "Подготовка сообщения",
                "address_text": address_text,
                "address_details": address,
                "caller_name": name,
                "caller_phone": phone,
                "caller_details": {"gender": facts["Пол"], "age": facts["Возраст"]},
                "features": {"ekp": answers, "victimsCount": victims_count},
                "additional_fields": {"details": flags, "messageChannel": plan["message_format"]},
            },
            recipient_service_ids=service_ids,
            use_recommended_recipients=p.service_ids is None,
        )

        plan["extra_evidence"] = extra_evidence(definitions, answers, plan)
        await validate_card_definition(session, card)
        job = AIJob(
            purpose=AIPurpose.GENERATION,
            created_by_id=teacher_id,
            idempotency_key=key,
            prompt_version=PROMPT_VERSION,
            model_version=settings.llm_model,
            input={
                "card": card.model_dump(mode="json"),
                "facts": facts,
                "seed": rng.randrange(2**31),
                "narrative": plan,
            },
            context={
                "fingerprint": fingerprint,
                "position": i,
                "request": request.model_dump(mode="json"),
            },
        )
        session.add(job)
        jobs.append(job)
    await session.commit()
    return [read_job(j) for j in jobs]
