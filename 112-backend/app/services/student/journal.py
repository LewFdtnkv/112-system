from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    ClassifierEntry,
    IncidentCard,
    Lesson,
    LessonEvaluation,
    ScenarioCard,
    ScenarioVersion,
)
from app.models.enums import (
    AttemptStatus,
    LessonStatus,
    TrainingRole,
)
from app.schemas.student import (
    JournalCardRead,
    StudentAssignmentRead,
    StudentLessonRead,
)
from app.services.dds_delivery import execution_for
from app.services.deadlines import attempt_deadline
from app.services.learning import learning_result


async def lesson_work(session: AsyncSession, lesson: Lesson, student_id: UUID) -> StudentLessonRead:
    rows = (
        await session.execute(
            select(
                Assignment,
                ScenarioVersion,
                ScenarioCard,
                Attempt,
                IncidentCard,
                ClassifierEntry.name,
            )
            .join(
                ScenarioVersion,
                ScenarioVersion.id == Assignment.scenario_version_id,
            )
            .outerjoin(ScenarioCard, ScenarioCard.id == Assignment.scenario_card_id)
            .outerjoin(
                Attempt,
                (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1),
            )
            .outerjoin(IncidentCard, IncidentCard.attempt_id == Attempt.id)
            .outerjoin(ClassifierEntry, ClassifierEntry.id == IncidentCard.classifier_entry_id)
            .where(Assignment.lesson_id == lesson.id, Assignment.student_id == student_id)
            .order_by(Assignment.position)
        )
    ).all()

    execution = await execution_for(session, lesson.id, student_id)
    stream = execution is not None and any(
        row[0].settings.get("delivery") == "dds-stream-v1" for row in rows
    )
    assignments = []
    previous_complete = True
    for assignment, scenario, source, attempt, card, category_name in rows:
        complete = attempt is not None and attempt.status in (
            AttemptStatus.COMPLETED,
            AttemptStatus.INTERRUPTED,
        )
        assignments.append(
            StudentAssignmentRead(
                id=assignment.id,
                position=assignment.position,
                title=(
                    "Ожидается поступление"
                    if stream and attempt is None
                    else source.snapshot["title"]
                    if source
                    else scenario.title
                ),
                role=scenario.role,
                available=(bool(attempt) if stream else previous_complete)
                and not complete
                and (attempt is None or attempt.status == AttemptStatus.IN_PROGRESS)
                and lesson.status == LessonStatus.ACTIVE
                and (
                    scenario.role == TrainingRole.OPERATOR_112
                    or bool(scenario.completion_rules.get("dds"))
                ),
                scheduled_at=assignment.scheduled_at,
                received_at=assignment.released_at,
                first_opened_at=attempt.first_opened_at if attempt else None,
                first_response_at=attempt.first_response_at if attempt else None,
                response_norm_seconds=attempt.settings_snapshot.get("response_norm_seconds")
                if stream and attempt
                else None,
                deadline_at=attempt_deadline(attempt, lesson) if attempt else None,
                attempt_id=attempt.id if attempt else None,
                card=JournalCardRead(
                    id=card.id,
                    display_number=card.display_number,
                    started_at=attempt.started_at,
                    status=card.status,
                    address_text=card.address_text,
                    description=card.description,
                    caller_name=card.caller_name,
                    caller_phone=card.caller_phone,
                    classifier_entry_id=card.classifier_entry_id,
                    category_name=category_name,
                )
                if card
                else None,
                status=attempt.status if attempt else "pending",
            )
        )
        previous_complete = previous_complete and complete
    state = (
        "submitted"
        if lesson.status == LessonStatus.FINISHED or (assignments and previous_complete)
        else ("in_progress" if any(item.attempt_id for item in assignments) else "assigned")
    )
    grade = await session.scalar(
        select(LessonEvaluation)
        .where(LessonEvaluation.lesson_id == lesson.id, LessonEvaluation.student_id == student_id)
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    return StudentLessonRead(
        delivery="dds-stream-v1" if stream else "sequential",
        execution_started_at=execution.started_at if execution else None,
        server_time=datetime.now(UTC),
        learning=lesson.learning,
        learning_result=learning_result([row[3] for row in rows if row[3]], grade),
        id=lesson.id,
        title=lesson.title,
        status=lesson.status,
        started_at=lesson.started_at,
        ended_at=lesson.ended_at,
        available_from=lesson.available_from,
        available_until=lesson.available_until,
        work_status=state,
        assignments=assignments,
    )
