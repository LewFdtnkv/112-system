"""Persist deterministic assessment inside the submission transaction.

No background worker or model availability is required for formal-field scoring.
The immutable attempt policy and criterion evidence make a result reproducible.
"""

import hashlib
import json
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select

from app.models import (
    Assignment,
    Attempt,
    AttemptEvent,
    CriterionEvidence,
    CriterionResult,
    Evaluation,
    LessonEvaluation,
    ScenarioCard,
)
from app.models.enums import AttemptStatus, EvaluationMethod, EvaluationStatus, LessonStatus
from app.schemas.assessment import AssessmentPolicy
from app.services.audit import append_event
from app.services.field_evaluation import check_fields

GROUPS = {
    "dds_status": "Статусы ДДС по сообщениям задания",
    "dds_crew": "Номер наряда",
    "dds_assignment": "Назначение и результат работы бригад",
    "classification": "Тип и признаки происшествия",
    "notification": "Оповещение служб",
    "address": "Адрес происшествия",
    "caller": "Сведения о заявителе",
    "victims": "Количество пострадавших",
}


def context_hash(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def field_group(path):
    if path == "classifier_entry_id" or path.startswith("features.ekp."):
        return "classification"
    if path == "recipients":
        return "notification"
    if path.startswith("address"):
        return "address"
    if path.startswith("caller"):
        return "caller"
    return "victims"


def weighted_criteria(check, policy):
    grouped = {}
    for field in check.fields:
        if field.scored:
            grouped.setdefault(field_group(field.field), []).append(field)
    result = []
    for code, fields in grouped.items():
        maximum = Decimal(getattr(policy.weights, code))
        correct = sum(field.status == "matched" for field in fields)
        points = (maximum * correct / len(fields)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        result.append(
            {
                "code": code,
                "label": GROUPS[code],
                "score": points,
                "max_score": maximum,
                "explanation": f"Совпало {correct} из {len(fields)} проверяемых полей.",
                "fields": fields,
            }
        )
    return result


async def assess_submission(session, attempt, lesson, card_read, *, publish=True):
    existing = await session.scalar(
        select(Evaluation)
        .where(Evaluation.attempt_id == attempt.id, Evaluation.method == EvaluationMethod.RULES)
        .order_by(Evaluation.revision.desc())
        .limit(1)
    )
    if existing is None:
        assignment = await session.get(Assignment, attempt.assignment_id)
        source = await session.get(ScenarioCard, assignment.scenario_card_id)
        policy = AssessmentPolicy.model_validate(
            attempt.settings_snapshot.get("assessment_policy", {})
        )
        if card_read.role == "dds":
            from app.services.dds_assessment import check_dds, criteria_dds

            check = check_dds(attempt.settings_snapshot["dds_policy"], card_read)
            criteria = criteria_dds(check)
        else:
            check = check_fields(source.snapshot, card_read)
            criteria = weighted_criteria(check, policy)
        if not criteria:
            # Composed operator cards always have a classifier and recipients, so this means
            # damaged/incompatible source data. Do not publish an invented zero or 100.
            raise ValueError("No assessable criteria in the scenario snapshot")
        audit_sequence = await session.scalar(
            select(func.max(AttemptEvent.sequence)).where(AttemptEvent.attempt_id == attempt.id)
        )
        policy_snapshot = (
            {"version": "dds-steps-v1", "weights": {"dds_status": 80, "dds_crew": 20}}
            if card_read.role == "dds"
            else policy.model_dump(mode="json")
        )
        snapshot = {
            "policy": policy_snapshot,
            "source": source.snapshot,
            "card": card_read.card.model_dump(mode="json"),
            "notified_services": [r.model_dump(mode="json") for r in card_read.notified_services],
            "audit_sequence": audit_sequence,
            "unverified_fields": [f.field for f in check.fields if not f.scored],
        }
        if card_read.role == "dds":
            if attempt.settings_snapshot["dds_policy"].get("required_crews"):
                policy_snapshot["version"] = "dds-crews-v2"
                policy_snapshot["weights"]["dds_assignment"] = 20
            snapshot["dds"] = card_read.dds
            snapshot["dds_policy"] = attempt.settings_snapshot["dds_policy"]
        snapshot["context_hash"] = context_hash(snapshot)
        evaluation = Evaluation(
            attempt_id=attempt.id,
            revision=1,
            method=EvaluationMethod.RULES,
            status=EvaluationStatus.COMPLETED,
            score=sum(c["score"] for c in criteria),
            max_score=sum(c["max_score"] for c in criteria),
            summary="Автоматическая оценка формальных полей. Смысл свободного текста не проверен.",
            completed_at=datetime.now(UTC),
            context_snapshot=snapshot,
        )
        session.add(evaluation)
        await session.flush()
        event_ids = list(
            await session.scalars(
                select(AttemptEvent.id)
                .where(
                    AttemptEvent.attempt_id == attempt.id,
                    AttemptEvent.kind.in_(
                        [
                            "card.draft_saved",
                            "card.notified",
                            "card.registered_without_notification",
                            "card.services_changed",
                            "dds.information",
                            "dds.status_changed",
                            "dds.crew_changed",
                            "dds.submitted",
                        ]
                    ),
                )
                .order_by(AttemptEvent.sequence.desc())
                .limit(16 if card_read.role == "dds" else 2)
            )
        )
        for criterion in criteria:
            row = CriterionResult(
                evaluation_id=evaluation.id,
                attempt_id=attempt.id,
                code=criterion["code"],
                score=criterion["score"],
                max_score=criterion["max_score"],
                explanation=criterion["explanation"],
                criterion_snapshot={
                    "policy_version": policy_snapshot["version"],
                    "label": criterion["label"],
                    "fields": [f.model_dump() for f in criterion["fields"]],
                },
            )
            session.add(row)
            await session.flush()
            session.add_all(
                [
                    CriterionEvidence(
                        criterion_result_id=row.id, attempt_event_id=event_id, attempt_id=attempt.id
                    )
                    for event_id in event_ids
                ]
            )
        await append_event(
            session,
            attempt.id,
            "assessment.rules_completed",
            {
                "evaluation_id": str(evaluation.id),
                "policy_version": policy_snapshot["version"],
                "audit_sequence": audit_sequence,
            },
        )
    if publish:
        await publish_lesson_result(session, lesson, attempt.student_id)


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
    closed = lesson.status == LessonStatus.FINISHED
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
        from app.services.student import review_attempts

        assessed = {e.attempt_id for e in evaluations}
        missing = [a for _, a in attempts if a and a.id not in assessed]
        cards = await review_attempts(session, missing)
        for attempt in missing:
            if attempt.id not in cards:
                return
            await assess_submission(session, attempt, lesson, cards[attempt.id], publish=False)
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
        "source_evaluation_ids": [str(e.id) for e in evaluations],
    }
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
