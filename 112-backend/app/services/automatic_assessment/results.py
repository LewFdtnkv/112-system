from decimal import ROUND_HALF_UP, Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from app.models import (
    Assignment,
    Attempt,
    CriterionResult,
    Evaluation,
    LessonEvaluation,
    LessonExecution,
)
from app.models.enums import AttemptStatus, EvaluationMethod, EvaluationStatus, LessonStatus
from app.services.automatic_assessment.attempts import assess_attempt
from app.services.automatic_assessment.criteria import GROUPS
from app.services.semantic_assessment.results import jobs_for, publish_result, summary
from app.services.student.reads import review_attempts


async def publish_lesson_result(session, lesson, student_id):
    # Caller holds the lesson lock. Once a result exists, neither retries nor backfills
    # supersede an automatic grade or a teacher's override.
    if await session.scalar(
        select(LessonEvaluation.id)
        .where(LessonEvaluation.lesson_id == lesson.id, LessonEvaluation.student_id == student_id)
        .limit(1)
    ):
        return
    attempts = (
        await session.execute(
            select(Assignment.id, Attempt)
            .outerjoin(Attempt, (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1))
            .where(Assignment.lesson_id == lesson.id, Assignment.student_id == student_id)
        )
    ).all()
    execution = await session.get(LessonExecution, (lesson.id, student_id))
    closed = lesson.status == LessonStatus.FINISHED or bool(execution and execution.ended_at)
    if not attempts or (
        not closed
        and any(
            a is None or a.status not in (AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED)
            for _, a in attempts
        )
    ):
        return
    ids = [a.id for _, a in attempts if a]
    evaluations = list(
        await session.scalars(
            select(Evaluation).where(
                Evaluation.attempt_id.in_(ids),
                Evaluation.method == EvaluationMethod.RULES,
                Evaluation.status == EvaluationStatus.COMPLETED,
            )
        )
    )
    if len(evaluations) != len(ids):
        # Lessons can straddle deployment: earlier cards may predate automatic grades.
        # Backfill only missing attempt assessments; existing/manual results stay intact.

        assessed = {e.attempt_id for e in evaluations}
        missing = [a for _, a in attempts if a and a.id not in assessed]
        cards = await review_attempts(session, missing)
        for attempt in missing:
            if attempt.id not in cards:
                return
            await assess_attempt(session, attempt, cards[attempt.id])
        evaluations = list(
            await session.scalars(
                select(Evaluation).where(
                    Evaluation.attempt_id.in_(ids),
                    Evaluation.method == EvaluationMethod.RULES,
                    Evaluation.status == EvaluationStatus.COMPLETED,
                )
            )
        )
    score = sum(e.score for e in evaluations)
    maximum = sum(e.max_score for e in evaluations)
    criterion_rows = list(
        await session.scalars(
            select(CriterionResult).where(
                CriterionResult.evaluation_id.in_([e.id for e in evaluations])
            )
        )
    )
    grouped = {}
    for criterion in criterion_rows:
        group = grouped.setdefault(
            criterion.code,
            {
                "code": criterion.code,
                "label": GROUPS[criterion.code],
                "score": 0,
                "max_score": 0,
                "explanation": "Сумма по карточкам урока.",
            },
        )
        group["score"] += float(criterion.score)
        group["max_score"] += float(criterion.max_score)
    details = {
        "policy_version": evaluations[0].context_snapshot["policy"]["version"]
        if evaluations
        else "weighted-fields-v1",
        "missed_cards": len(attempts) - len(ids),
        "aggregation": "mean_card_percent_with_zero_missing"
        if len(ids) < len(attempts)
        else "weighted_criteria_sum",
        "scope": "formal_fields",
        "criteria": list(grouped.values()),
        "evaluated_cards": len(ids),
        "unverified_fields": sum(len(e.context_snapshot["unverified_fields"]) for e in evaluations),
        "assistance": {
            "issued_count": sum(
                e.context_snapshot.get("assistance", {}).get("issued_count", 0) for e in evaluations
            ),
            "levels": {
                level: sum(
                    e.context_snapshot.get("assistance", {}).get("levels", {}).get(level, 0)
                    for e in evaluations
                )
                for level in ("goal", "explanation", "solution")
            },
            "scoring": "recorded_without_penalty",
        },
        "source_evaluation_ids": [str(e.id) for e in evaluations],
    }

    details["semantic"] = summary(await jobs_for(session, ids))
    session.add(
        LessonEvaluation(
            lesson_id=lesson.id,
            student_id=student_id,
            reviewer_id=None,
            request_id=uuid5(NAMESPACE_URL, f"system112:automatic:{lesson.id}:{student_id}"),
            revision=1,
            method="rules",
            score=(
                (
                    sum((100 * e.score / e.max_score for e in evaluations), Decimal(0))
                    / len(attempts)
                )
                if len(ids) < len(attempts)
                else (100 * score / maximum)
            ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            max_score=100,
            comment=(
                "Рассчитано автоматически по формальным критериям. "
                "Смысл текста не входит в балл; преподаватель может пересмотреть результат."
            ),
            assessment_details=details,
        )
    )
    await session.flush()

    await publish_result(session, lesson, student_id)
