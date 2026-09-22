from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Assignment, Attempt, AttemptEvent, Evaluation, Lesson
from app.models.enums import EvaluationMethod, EventActor
from app.schemas.assessment import AIAssessmentOutput
from app.schemas.audit import AuditPage
from app.services.audit import append_event
from app.services.student import owned_attempt


async def record_observations(session, attempt_id, student_id, batch):
    attempt, _ = await owned_attempt(session, attempt_id, student_id)
    await session.refresh(attempt, with_for_update=True)
    if attempt.ended_at and datetime.now(UTC) - attempt.ended_at > timedelta(minutes=5):
        raise HTTPException(status_code=409, detail="Observation window has closed")
    existing = {
        row.command_id: row
        for row in await session.scalars(
            select(AttemptEvent).where(
                AttemptEvent.attempt_id == attempt.id,
                AttemptEvent.command_id.in_([e.command_id for e in batch.events]),
            )
        )
    }
    total = await session.scalar(
        select(func.count())
        .select_from(AttemptEvent)
        .where(AttemptEvent.attempt_id == attempt.id, AttemptEvent.kind.like("ui.%"))
    )
    if total + len([e for e in batch.events if e.command_id not in existing]) > 2000:
        raise HTTPException(status_code=429, detail="Attempt observation limit reached")
    for observation in batch.events:
        payload = {
            "origin": "browser",
            "trusted": False,
            "field": observation.field,
            "value": observation.value,
        }
        previous = existing.get(observation.command_id)
        if previous:
            if (
                previous.kind != observation.kind
                or previous.payload != payload
                or previous.client_occurred_at != observation.client_occurred_at
            ):
                raise HTTPException(
                    status_code=409, detail="Observation ID was reused with different data"
                )
            continue
        row = await append_event(
            session,
            attempt.id,
            observation.kind,
            payload,
            actor=EventActor.STUDENT,
            actor_id=student_id,
            command_id=observation.command_id,
            client_occurred_at=observation.client_occurred_at,
        )
        existing[observation.command_id] = row
    await session.commit()
    return {"accepted": len(batch.events)}


async def teacher_attempt(session, lesson_id, student_id, attempt_id, teacher_id):
    attempt = await session.scalar(
        select(Attempt)
        .join(Assignment, Assignment.id == Attempt.assignment_id)
        .join(Lesson, Lesson.id == Assignment.lesson_id)
        .where(
            Attempt.id == attempt_id,
            Attempt.student_id == student_id,
            Lesson.id == lesson_id,
            Lesson.teacher_id == teacher_id,
        )
    )
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return attempt


async def audit_page(session, attempt_id, after=0, limit=50, through=None):
    last = (
        await session.scalar(
            select(func.max(AttemptEvent.sequence)).where(AttemptEvent.attempt_id == attempt_id)
        )
        or 0
    )
    if through is not None:
        last = min(last, through)
    rows = list(
        await session.scalars(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == attempt_id,
                AttemptEvent.sequence > after,
                AttemptEvent.sequence <= last,
            )
            .order_by(AttemptEvent.sequence)
            .limit(limit + 1)
        )
    )
    return AuditPage(
        items=rows[:limit],
        last_sequence=last,
        next_sequence=rows[limit - 1].sequence if len(rows) > limit else None,
    )


async def assessment_context(session, attempt):
    evaluation = await session.scalar(
        select(Evaluation)
        .where(Evaluation.attempt_id == attempt.id, Evaluation.method == EvaluationMethod.RULES)
        .order_by(Evaluation.revision.desc())
        .limit(1)
    )
    if evaluation is None:
        raise HTTPException(
            status_code=409, detail="Submit the card before requesting assessment context"
        )
    snapshot = evaluation.context_snapshot
    # No model calls or jobs are scheduled here. The contract is reviewable by the teacher.
    return {
        "contract_version": "assessment-ai-v1",
        "attempt_id": str(attempt.id),
        "evaluation_id": str(evaluation.id),
        "context_hash": snapshot["context_hash"],
        "reference": snapshot["source"],
        "submitted_card": snapshot["card"],
        "notified_services": snapshot["notified_services"],
        "dds": snapshot.get("dds"),
        "dds_policy": snapshot.get("dds_policy"),
        "policy": snapshot["policy"],
        "learning": snapshot.get("learning", {}),
        "unverified_fields": snapshot["unverified_fields"],
        "audit_through_sequence": snapshot["audit_sequence"],
        "audit": (
            await audit_page(session, attempt.id, through=snapshot["audit_sequence"])
        ).model_dump(mode="json"),
        "output_schema": AIAssessmentOutput.model_json_schema(),
        "ai_connected": False,
    }


async def reject_command(session, attempt_id, student_id, operation, error):
    # save/submit validate business rules before any mutation. Keep their lesson lock
    # until the rejection is recorded; never write into another student's audit.
    if error.status_code not in (409, 422):
        return
    attempt, _ = await owned_attempt(session, attempt_id, student_id, lock=True)
    await append_event(
        session,
        attempt.id,
        "command.rejected",
        {
            "operation": operation,
            "status": error.status_code,
            "reason": str(error.detail),
        },
        actor=EventActor.STUDENT,
        actor_id=student_id,
    )
    await session.commit()
