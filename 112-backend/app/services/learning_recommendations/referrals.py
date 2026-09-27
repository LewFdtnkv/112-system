"""The model recommends a skill; the server grants a scoped, single-use referral."""

from calendar import monthrange
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from app.models import (
    Assignment,
    GroupMembership,
    LearningReferral,
    Lesson,
    LessonEvaluation,
    MessageRecipient,
    Scenario,
    ScenarioCard,
    ScenarioVersion,
    Service,
    TeachingMessage,
    TrainingGroup,
    User,
)
from app.schemas.authoring import LessonStart
from app.schemas.learning import LearningPolicy
from app.services.authoring.catalog_access import published_classifier, published_profile
from app.services.learning_recommendations.profile import build_profile
from app.services.learning_scope import validate_exercise
from app.services.lessons import start_lesson


def next_month(issued_at: datetime) -> datetime:
    year = issued_at.year + (issued_at.month == 12)
    month = issued_at.month % 12 + 1
    return issued_at.replace(
        year=year, month=month, day=min(issued_at.day, monthrange(year, month)[1])
    )


def recommendation_policy(material, label):
    kind = material["lesson_kind"]
    level = "none" if kind == "assessment" else "goal" if kind == "practice" else "explanation"
    return LearningPolicy.model_validate(
        {
            "kind": kind,
            "objective": f"Рекомендованная тренировка: {label.lower()}.",
            "target_skills": [material["skill"]] if kind in {"skill_practice", "review"} else [],
            "assistance": {"max_level": level},
        }
    )


async def candidate_scenarios(session, student_id, role):
    # Reuse completed work only: never reveal a future or unfinished assessment.
    teachers = (
        select(TrainingGroup.teacher_id)
        .join(GroupMembership)
        .where(GroupMembership.user_id == student_id, TrainingGroup.disbanded_at.is_(None))
    )
    assigned = (
        select(Assignment.scenario_version_id)
        .join(LessonEvaluation, LessonEvaluation.lesson_id == Assignment.lesson_id)
        .join(Lesson, Lesson.id == Assignment.lesson_id)
        .where(
            Assignment.student_id == student_id,
            LessonEvaluation.student_id == student_id,
            Lesson.status != "cancelled",
        )
    )
    return list(
        (
            await session.execute(
                select(ScenarioVersion, Scenario.created_by_id)
                .join(Scenario)
                .join(User, User.id == Scenario.created_by_id)
                .where(
                    ScenarioVersion.id.in_(assigned),
                    ScenarioVersion.role == role,
                    ScenarioVersion.status == "published",
                    Scenario.is_archived.is_(False),
                    Scenario.created_by_id.in_(teachers),
                    User.is_active.is_(True),
                    User.is_teacher.is_(True),
                )
                .order_by(ScenarioVersion.created_at.desc(), ScenarioVersion.id)
                .limit(100)
            )
        ).all()
    )


async def issue_referrals(session, message, student_id, materials):
    """Caller holds the message/student lock; this function never commits."""
    expires = next_month(message.created_at)
    if message.details.get("obsolete") or expires <= datetime.now(UTC):
        return 0
    existing = set(
        await session.scalars(
            select(LearningReferral.skill).where(LearningReferral.message_id == message.id)
        )
    )
    candidates = await candidate_scenarios(session, student_id, message.details["role"])
    cards_by_version = {}
    for card in await session.scalars(
        select(ScenarioCard)
        .where(ScenarioCard.scenario_version_id.in_([v.id for v, _ in candidates]))
        .order_by(ScenarioCard.position)
    ):
        cards_by_version.setdefault(card.scenario_version_id, []).append(card)
    recipient_ids = {
        UUID(r["service_id"])
        for cards in cards_by_version.values()
        for card in cards
        for r in card.snapshot.get("recipients", [])
    }
    active_services = set(
        await session.scalars(
            select(Service.id).where(Service.id.in_(recipient_ids), Service.is_active.is_(True))
        )
    )
    issued = 0
    for material in materials:
        skill = material["skill"]
        if skill in existing:
            continue
        label = message.details["skills"][skill]["label"]
        policy = recommendation_policy(material, label)
        for scenario, teacher_id in candidates:
            cards = cards_by_version.get(scenario.id, [])
            if not cards or any(
                UUID(r["service_id"]) not in active_services
                for card in cards
                for r in card.snapshot.get("recipients", [])
            ):
                continue
            try:
                validate_exercise(policy, scenario, cards)
                await published_classifier(session, scenario.classifier_version_id)
                if scenario.service_profile_id:
                    await published_profile(session, scenario.service_profile_id)
            except HTTPException:
                continue
            session.add(
                LearningReferral(
                    message_id=message.id,
                    student_id=student_id,
                    scenario_version_id=scenario.id,
                    teacher_id=teacher_id,
                    skill=skill,
                    title=f"По направлению: {label}"[:255],
                    learning=policy.model_dump(mode="json"),
                    expires_at=expires,
                )
            )
            existing.add(skill)
            issued += 1
            break
    await session.flush()
    return issued


async def create_lesson(session, referral_id: UUID, student_id: UUID):
    # Same lock order as recommendation publication/invalidation (student -> message).
    await session.scalar(select(User).where(User.id == student_id).with_for_update())
    referral = await session.scalar(
        select(LearningReferral).where(
            LearningReferral.id == referral_id, LearningReferral.student_id == student_id
        )
    )
    if referral is None:
        raise HTTPException(404, "Learning referral not found")
    message = await session.scalar(
        select(TeachingMessage)
        .join(MessageRecipient)
        .where(
            TeachingMessage.id == referral.message_id,
            TeachingMessage.source == "learning_advice",
            MessageRecipient.student_id == student_id,
        )
        .with_for_update(of=TeachingMessage)
    )
    if message is None:
        raise HTTPException(404, "Learning referral not found")
    if referral.lesson_id:
        return {"lesson_id": referral.lesson_id, "created": False}
    if referral.expires_at <= datetime.now(UTC):
        raise HTTPException(410, "Learning referral expired")
    profile = await build_profile(session, student_id, message.details["role"])
    if message.details.get("obsolete") or any(
        profile["sources"].get(key) != value
        for key, value in message.details.get("sources", {}).items()
    ):
        raise HTTPException(409, "Learning referral superseded")
    teacher = await session.get(User, referral.teacher_id)
    if not teacher or not teacher.is_active or not teacher.is_teacher:
        raise HTTPException(409, "Learning referral teacher unavailable")
    group_id = await session.scalar(
        select(TrainingGroup.id)
        .join(GroupMembership)
        .where(
            GroupMembership.user_id == student_id,
            TrainingGroup.teacher_id == referral.teacher_id,
            TrainingGroup.disbanded_at.is_(None),
        )
        .order_by(TrainingGroup.id)
        .limit(1)
    )
    if group_id is None:
        raise HTTPException(409, "Learning referral membership ended")
    # All parameters come from the saved referral. No client-selected recipients or scenarios.
    lesson, created = await start_lesson(
        session,
        referral.teacher_id,
        LessonStart(
            request_id=referral.id,
            group_id=group_id,
            student_id=student_id,
            scenario_version_id=referral.scenario_version_id,
            title=referral.title,
            learning=referral.learning,
        ),
        commit=False,
    )
    referral.lesson_id = lesson.id
    await session.commit()
    return {"lesson_id": lesson.id, "created": created}


async def referrals_for_messages(session, student_id, message_ids):
    rows = await session.execute(
        select(LearningReferral, Lesson.title)
        .outerjoin(Lesson, Lesson.id == LearningReferral.lesson_id)
        .where(
            LearningReferral.student_id == student_id, LearningReferral.message_id.in_(message_ids)
        )
    )
    now = datetime.now(UTC)
    return {
        (referral.message_id, referral.skill): {
            "id": str(referral.id),
            "expires_at": referral.expires_at.isoformat(),
            "status": "used"
            if referral.lesson_id
            else "expired"
            if referral.expires_at <= now
            else "available",
            "lesson_id": str(referral.lesson_id) if referral.lesson_id else None,
            "lesson_title": title,
        }
        for referral, title in rows
    }
