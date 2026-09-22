import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    GroupMembership,
    Lesson,
    Scenario,
    ScenarioCard,
    Service,
    TrainingGroup,
    User,
)
from app.models.enums import LessonStatus, PublicationStatus, TrainingMode
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
            learning=lesson.learning,
            id=lesson.id,
            title=lesson.title,
            teacher_id=lesson.teacher_id,
            group_id=lesson.group_id,
            scenario_version_id=lesson.scenario_version_id,
            status=lesson.status,
            started_at=lesson.started_at,
            ended_at=lesson.ended_at,
            available_from=lesson.available_from,
            available_until=lesson.available_until,
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
    if payload.learning.kind in ("introduction", "worked_example"):
        raise HTTPException(422, "Guided learning is not available yet")
    fingerprint_payload = payload.model_dump(mode="json", exclude={"request_id"})
    for key in ("group_ids", "student_ids", "available_from", "available_until"):
        if not fingerprint_payload[key]:
            fingerprint_payload.pop(key)
    if payload.student_id is None:
        # Keep fingerprints compatible with launches made before individual targeting existed.
        fingerprint_payload.pop("student_id")
    fingerprint = hashlib.sha256(
        json.dumps(
            fingerprint_payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    existing = await replay(session, teacher_id, payload.request_id, fingerprint)
    if existing is not None:
        return await lesson_read(session, existing), False
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": str(teacher_id) + str(payload.request_id)},
    )
    groups = sorted(set(payload.group_ids or ([payload.group_id] if payload.group_id else [])))
    for group_id in groups:
        await owned_group(session, group_id, teacher_id, lock=True)
    # A concurrent launch may have finished while this request waited for the group lock.
    existing = await replay(session, teacher_id, payload.request_id, fingerprint)
    if existing is not None:
        return await lesson_read(session, existing), False
    scenario = await owned_scenario(session, payload.scenario_version_id, teacher_id)
    skills = set(payload.learning.target_skills)
    if scenario.role == "operator_112" and skills & {"dds_response", "dds_crews"}:
        raise HTTPException(422, "DDS skills require a DDS scenario")
    if scenario.role == "dds" and skills & {
        "address",
        "caller",
        "classification",
        "notification",
        "description",
    }:
        raise HTTPException(422, "Card entry skills require an operator 112 scenario")
    parent = await session.scalar(
        select(Scenario).where(Scenario.id == scenario.scenario_id).with_for_update()
    )
    if parent.is_archived:
        raise HTTPException(409, "Archived scenarios cannot be assigned")
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
    targets = select(GroupMembership.user_id).where(GroupMembership.group_id.in_(groups))
    student_query = select(User).where(User.id.in_(targets)).order_by(User.id)
    if payload.student_id is not None:
        student_query = student_query.where(User.id == payload.student_id)
    if payload.student_ids:
        owned = set(
            await session.scalars(
                select(GroupMembership.user_id)
                .join(TrainingGroup)
                .where(
                    TrainingGroup.teacher_id == teacher_id,
                    GroupMembership.user_id.in_(payload.student_ids),
                )
            )
        )
        if owned != set(payload.student_ids):
            raise HTTPException(404, "Student is not in your groups")
        student_query = (
            select(User)
            .where(User.id.in_(targets) | User.id.in_(payload.student_ids))
            .order_by(User.id)
        )
    students = list(await session.scalars(student_query))
    if not students:
        if payload.student_id is not None:
            raise HTTPException(status_code=404, detail="Student is not a member of this group")
        raise HTTPException(status_code=409, detail="The group has no students")
    if any(not student.is_active or student.is_admin or student.is_teacher for student in students):
        raise HTTPException(
            status_code=409, detail="All group members must be active student accounts"
        )
    now = datetime.now(UTC)
    if payload.available_until and payload.available_until <= now:
        raise HTTPException(422, "Assignment end must be in the future")
    scheduled = payload.available_from is not None and payload.available_from > now
    lesson = Lesson(
        learning=payload.learning.model_dump(mode="json"),
        title=payload.title or scenario.title,
        teacher_id=teacher_id,
        group_id=groups[0] if len(groups) == 1 and not payload.student_ids else None,
        scenario_version_id=scenario.id,
        start_request_id=payload.request_id,
        start_fingerprint=fingerprint,
        status=LessonStatus.PLANNED if scheduled else LessonStatus.ACTIVE,
        started_at=None if scheduled else now,
        available_from=payload.available_from or now,
        available_until=payload.available_until,
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
                    mode=TrainingMode.ASSESSMENT
                    if payload.learning.kind == "assessment"
                    else TrainingMode.PRACTICE,
                    settings={"learning": payload.learning.model_dump(mode="json")},
                    time_limit_seconds=payload.time_limit_seconds,
                    hint_delay_seconds=payload.learning.assistance.idle_seconds,
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
