"""Profiles, messages, editable examples and retrieval memory for the demo."""

from io import BytesIO
from uuid import UUID

from PIL import Image, ImageDraw
from sqlalchemy import select

from app.models import (
    AssessmentExample,
    AssessmentMemoryPreference,
    CardTemplateRecipient,
    TeachingMessage,
    UserPhoto,
)
from app.schemas.activity import MessageCreate
from app.schemas.authoring import GenerationExampleUpdate
from app.services import messages
from app.services.assessment_memory import library
from app.services.authoring.cards import set_generation_example
from scripts.seed_demo_ai import populate_ai
from scripts.seed_demo_media import populate_media


async def populate_support(gateway, state, create, students, group_id, source, training):
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

    dds_card = await create(
        "dds-generation-card",
        "cards",
        {
            "title": f"{prefix}: новая ситуация ДДС от ИИ",
            "classifier_version_id": str(source.classifier_version_id),
            "classifier_entry_id": str(source.classifier_entry_id),
            "caller_message": source.caller_message,
            "instructions": source.instructions,
            "data": source.data,
            "recipient_service_ids": [str(r) for r in recipients],
        },
    )
    media = await populate_media(gateway, state, students[0], training, source)
    ai = await populate_ai(gateway, state, source, dds_card, training)
    return {
        "message_ids": message_ids,
        "extra_group_id": extra_group,
        "archived_group_id": archived_group,
        "editable_card_id": editable,
        "assessment_example_id": str(example.id),
        **media,
        **ai,
    }
