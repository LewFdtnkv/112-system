import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, GroupMembership, Lesson, ScenarioCard, Service, User
from app.models.enums import LessonStatus, PublicationStatus
from app.schemas.authoring import LessonRead, LessonStart
from app.services.authoring import owned_scenario, published_classifier, published_profile
from app.services.groups import owned_group


async def owned_lesson(session: AsyncSession, lesson_id: UUID, teacher_id: UUID) -> Lesson:
    lesson = await session.scalar(
        select(Lesson).where(
            Lesson.id == lesson_id,
            Lesson.teacher_id == teacher_id,
        )
    )
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


async def lesson_read(session: AsyncSession, lesson: Lesson) -> LessonRead:
    return (await lesson_reads(session, [lesson]))[0]


async def lesson_reads(session: AsyncSession, lessons: list[Lesson]) -> list[LessonRead]:
    if not lessons:
        return []
    counts = {
        lesson_id: (students, assignments)
        for lesson_id, students, assignments in (
            await session.execute(
                select(
                    Assignment.lesson_id,
                    func.count(func.distinct(Assignment.student_id)),
                    func.count(Assignment.id),
                )
                .where(Assignment.lesson_id.in_([lesson.id for lesson in lessons]))
                .group_by(Assignment.lesson_id)
            )
        ).all()
    }
    return [
        LessonRead(
            id=lesson.id,
            title=lesson.title,
            teacher_id=lesson.teacher_id,
            group_id=lesson.group_id,
            scenario_version_id=lesson.scenario_version_id,
            status=lesson.status,
            started_at=lesson.started_at,
            ended_at=lesson.ended_at,
            student_count=counts.get(lesson.id, (0, 0))[0],
            assignment_count=counts.get(lesson.id, (0, 0))[1],
        )
        for lesson in lessons
    ]


async def replay(
    session: AsyncSession, teacher_id: UUID, request_id: UUID, fingerprint: str
) -> Lesson | None:
    lesson = await session.scalar(
        select(Lesson).where(
            Lesson.teacher_id == teacher_id,
            Lesson.start_request_id == request_id,
        )
    )
    if lesson is not None and lesson.start_fingerprint != fingerprint:
        raise HTTPException(
            status_code=409, detail="Request ID was already used with different parameters"
        )
    return lesson


async def start_lesson(
    session: AsyncSession, teacher_id: UUID, payload: LessonStart
) -> tuple[LessonRead, bool]:
    fingerprint = hashlib.sha256(
        json.dumps(
            payload.model_dump(mode="json", exclude={"request_id"}),
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    existing = await replay(session, teacher_id, payload.request_id, fingerprint)
    if existing is not None:
        return await lesson_read(session, existing), False
    await owned_group(session, payload.group_id, teacher_id, lock=True)
    # A concurrent launch may have finished while this request waited for the group lock.
    existing = await replay(session, teacher_id, payload.request_id, fingerprint)
    if existing is not None:
        return await lesson_read(session, existing), False
    scenario = await owned_scenario(session, payload.scenario_version_id, teacher_id)
    if scenario.status != PublicationStatus.PUBLISHED:
        raise HTTPException(status_code=409, detail="A published scenario is required")
    await published_classifier(session, scenario.classifier_version_id)
    if scenario.service_profile_id is not None:
        await published_profile(session, scenario.service_profile_id)
    cards = list(
        await session.scalars(
            select(ScenarioCard)
            .where(
                ScenarioCard.scenario_version_id == scenario.id,
            )
            .order_by(ScenarioCard.position)
        )
    )
    if not cards:
        raise HTTPException(status_code=409, detail="The scenario has no cards")
    recipient_ids = {
        UUID(recipient["service_id"]) for card in cards for recipient in card.snapshot["recipients"]
    }
    active_count = await session.scalar(
        select(func.count())
        .select_from(Service)
        .where(
            Service.id.in_(recipient_ids),
            Service.is_active.is_(True),
        )
    )
    if active_count != len(recipient_ids):
        raise HTTPException(status_code=409, detail="A scenario recipient is inactive")
    students = list(
        await session.scalars(
            select(User)
            .join(
                GroupMembership,
                GroupMembership.user_id == User.id,
            )
            .where(GroupMembership.group_id == payload.group_id)
            .order_by(User.id)
        )
    )
    if not students:
        raise HTTPException(status_code=409, detail="The group has no students")
    if any(not student.is_active or student.is_admin or student.is_teacher for student in students):
        raise HTTPException(
            status_code=409, detail="All group members must be active student accounts"
        )
    lesson = Lesson(
        title=payload.title or scenario.title,
        teacher_id=teacher_id,
        group_id=payload.group_id,
        scenario_version_id=scenario.id,
        start_request_id=payload.request_id,
        start_fingerprint=fingerprint,
        status=LessonStatus.ACTIVE,
        started_at=datetime.now(UTC),
    )
    try:
        session.add(lesson)
        await session.flush()
        session.add_all(
            [
                Assignment(
                    lesson_id=lesson.id,
                    student_id=student.id,
                    scenario_version_id=scenario.id,
                    scenario_card_id=card.id,
                    position=card.position,
                    mode=payload.mode,
                    time_limit_seconds=payload.time_limit_seconds,
                    hint_delay_seconds=payload.hint_delay_seconds,
                )
                for student in students
                for card in cards
            ]
        )
        await session.commit()
    except IntegrityError:
        # Same request ID racing across different group locks is guarded by the DB unique key.
        await session.rollback()
        existing = await replay(session, teacher_id, payload.request_id, fingerprint)
        if existing is None:
            raise
        return await lesson_read(session, existing), False
    return await lesson_read(session, lesson), True
