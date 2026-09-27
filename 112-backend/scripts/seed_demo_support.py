"""Profiles, messages, editable examples, retrieval memory and offline call history."""

import secrets
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import NAMESPACE_URL, UUID, uuid5

from PIL import Image, ImageDraw
from sqlalchemy import select

from app.models import (
    AssessmentExample,
    AssessmentMemoryPreference,
    CardTemplateRecipient,
    TeachingMessage,
    TelephonyEvent,
    TelephonyStation,
    TrainingCall,
    UserPhoto,
)
from app.schemas.activity import MessageCreate
from app.schemas.authoring import GenerationExampleUpdate
from app.services import messages
from app.services.assessment_memory import library
from app.services.authoring.cards import set_generation_example
from scripts.seed_demo_ai import populate_ai


async def populate_support(gateway, state, create, students, group_id, source, attempts, training):
    session = gateway.session
    teacher_id = gateway.teacher.id
    prefix = state.data["prefix"]
    from app.models import TrainingGroup
    from app.services.groups import disband_group

    extra_group = await create("second-group", "groups", {"name": f"{prefix}: резервная группа"})
    archived_group = await create(
        "archived-group", "groups", {"name": f"{prefix}: завершённый набор (архив)"}
    )
    archive = await session.get(TrainingGroup, UUID(archived_group))
    if archive.disbanded_at is None:
        await gateway.enroll(archived_group, students[-1])
        await disband_group(session, archive.id, teacher_id)
    message_ids = []
    for name, text, target in (
        (
            "welcome",
            "Учебная группа готова. Начните с освоения интерфейса, "
            "затем попробуйте практику 112 и ДДС.",
            {"group_id": group_id},
        ),
        (
            "review",
            "Посмотрите завершённые работы и разбор по карточкам. "
            "Обратите внимание на адрес и порядок работы бригад.",
            {"student_id": students[0]},
        ),
        (
            "unread",
            "После практики выполните контроль без подсказок. "
            "Это демонстрационное непрочитанное сообщение.",
            {"student_id": students[0]},
        ),
    ):
        marker = f"full-demo-message-{name}"
        message_id = state.data["ids"].get(marker)
        if not message_id:
            # Unique fixture text also recovers the commit/checkpoint interruption gap.
            text = f"{prefix}: {text}"
            existing = await session.scalar(
                select(TeachingMessage).where(
                    TeachingMessage.teacher_id == teacher_id, TeachingMessage.text == text
                )
            )
            sent = (
                {"id": existing.id}
                if existing
                else await messages.send_message(
                    session, teacher_id, MessageCreate(text=text, **target)
                )
            )
            message_id = str(sent["id"])
            if name == "review":
                await messages.mark_read(session, UUID(message_id), UUID(students[0]))
            state.remember(marker, message_id)
        message_ids.append(message_id)

    # Neutral numbered avatars are synthetic shapes, not portraits of real people.
    for index, user_id in enumerate([str(teacher_id), *students[:3]]):
        if await session.get(UserPhoto, UUID(user_id)) is None:
            image = Image.new("RGB", (128, 128), (35 + index * 30, 85, 155))
            draw = ImageDraw.Draw(image)
            draw.ellipse((40, 20, 88, 68), fill="white")
            draw.ellipse((20, 76, 108, 164), fill="white")
            buffer = BytesIO()
            image.save(buffer, format="JPEG")
            session.add(UserPhoto(user_id=UUID(user_id), content=buffer.getvalue()))
    await session.commit()

    await library.seed(session)
    # A teacher-owned example demonstrates editing visibility without changing shared examples.
    example_key = f"full-demo/{teacher_id}/address"
    example = await session.scalar(
        select(AssessmentExample).where(AssessmentExample.source_key == example_key)
    )
    if example is None:
        example = AssessmentExample(
            source_key=example_key,
            created_by_id=teacher_id,
            kind="text",
            role="operator_112",
            criterion_code="address_text",
            policy_version="semantic-v1",
            situation="Учебный вызов: Москва, Учебная улица, дом 1.",
            reference="Москва, Учебная улица, дом 1",
            answer="Москва, Учебная улица",
            verdict="partial",
            reason="Демонстрационный пример: не указан известный номер дома.",
            search_text="Учебный пример неполного адреса: пропущен дом",
            active=True,
        )
        session.add(example)
        await session.flush()
        session.add(
            AssessmentMemoryPreference(teacher_id=teacher_id, example_id=example.id, disabled=True)
        )
        await session.commit()

    recipients = list(
        await session.scalars(
            select(CardTemplateRecipient.service_id).where(
                CardTemplateRecipient.card_template_id == source.id
            )
        )
    )
    editable = await create(
        "editable-card",
        "cards",
        {
            "title": f"{prefix}: образец для редактирования и генерации ДДС",
            "classifier_version_id": str(source.classifier_version_id),
            "classifier_entry_id": str(source.classifier_entry_id),
            "caller_message": source.caller_message,
            "instructions": source.instructions,
            "data": source.data,
            "recipient_service_ids": [str(r) for r in recipients],
            "dds_exercise": source.dds_exercise,
        },
    )
    marker = "full-demo-approved-example"
    if marker not in state.data["ids"]:
        from app.models import CardTemplate

        card = await session.get(CardTemplate, UUID(editable))
        await set_generation_example(
            session,
            teacher_id,
            card.id,
            GenerationExampleUpdate(enabled=True, revision=card.revision),
        )
        state.remember(marker, editable)

    calls = await call_history(session, teacher_id, students[0], attempts[0], prefix)
    audio = await phone_audio(session, state)
    ai = await populate_ai(gateway, state, source, students, training)
    return {
        "message_ids": message_ids,
        "extra_group_id": extra_group,
        "archived_group_id": archived_group,
        "editable_card_id": editable,
        "assessment_example_id": str(example.id),
        "call_ids": calls,
        "audio_ids": audio,
        **ai,
    }


async def phone_audio(session, state):
    from app.models import CallCue, ScenarioCard
    from app.services.telephony.media import asset_for, complete
    from app.services.telephony.voice_pack import greeting_bytes

    scenario_id = state.data["ids"].get("source-training-dds-phone-scenario-v2")
    if not scenario_id:
        return []
    text, data = greeting_bytes()
    asset = await asset_for(session, text, "crew-voice-pack", "crew-dialogue-v1")
    if asset.status == "queued" and asset.file_key is None:
        complete(asset, data)
    source_id = await session.scalar(
        select(ScenarioCard.id).where(ScenarioCard.scenario_version_id == UUID(scenario_id))
    )
    cue = await session.scalar(
        select(CallCue).where(
            CallCue.scenario_card_id == source_id, CallCue.contact_key == "fire-chief"
        )
    )
    if cue is None:
        session.add(
            CallCue(
                scenario_card_id=source_id,
                contact_key="fire-chief",
                contact_name="Руководитель учебного расчёта",
                audio_id=asset.id,
            )
        )
    failed = await asset_for(
        session,
        "Демонстрационная ошибка подготовки аудио.",
        "demo-fixture",
        f"demo-{state.data['prefix']}-v1",
    )
    if failed.status == "queued":
        failed.status, failed.attempts = "failed", 3
        failed.error = "Демонстрационный сбой. Можно загрузить WAV вручную."
    await session.commit()
    return [str(asset.id), str(failed.id)]


async def call_history(session, teacher_id, student_id, attempt_id, prefix):
    """Explicit demo transport: never provider-confirmed, never eligible for dispatch."""
    station_id = uuid5(NAMESPACE_URL, f"full-demo/{teacher_id}/station")
    if await session.get(TelephonyStation, station_id) is None:
        session.add(
            TelephonyStation(
                id=station_id,
                name=f"{prefix}: демо-станция (отключена)",
                mode="external",
                provider="demo-fixture",
                endpoint=f"{prefix}-demo",
                sip_password=secrets.token_urlsafe(24),
                enabled=False,
                provisioned=False,
            )
        )
        await session.flush()
    result = []
    for status in ("ended", "busy", "no_answer", "failed"):
        call_id = uuid5(NAMESPACE_URL, f"full-demo/{teacher_id}/call/{status}")
        result.append(str(call_id))
        if await session.get(TrainingCall, call_id):
            continue
        now = datetime.now(UTC)
        session.add(
            TrainingCall(
                id=call_id,
                attempt_id=UUID(attempt_id),
                command_id=call_id,
                initiated_by_id=UUID(student_id),
                station_id=station_id,
                contact_name="Демонстрационный собеседник",
                target_service_name="Учебная служба",
                endpoint_key="demo-fixture",
                provider="demo-fixture",
                transport="manual",
                status=status,
                started_at=now - timedelta(seconds=30),
                connected_at=now - timedelta(seconds=20) if status == "ended" else None,
                ended_at=now,
                dispatched_at=now,
                result="Демонстрационная история. Реального соединения и записи нет.",
            )
        )
        await session.flush()
        session.add(
            TelephonyEvent(
                call_id=call_id,
                provider="demo-fixture",
                event_id=str(call_id),
                kind=status,
                occurred_at=now,
                payload={"demo_fixture": True, "provider_confirmed": False},
            )
        )
    await session.commit()
    return result
