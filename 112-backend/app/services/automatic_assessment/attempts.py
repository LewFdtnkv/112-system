from datetime import UTC, datetime

from sqlalchemy import func, select

from app.core.fingerprints import context_hash
from app.models import (
    Assignment,
    AttemptEvent,
    CriterionEvidence,
    CriterionResult,
    Evaluation,
    ScenarioCard,
)
from app.models.enums import EvaluationMethod, EvaluationStatus
from app.schemas.assessment import AssessmentPolicy
from app.services.audit import append_event
from app.services.automatic_assessment.criteria import weighted_criteria
from app.services.dds_assessment import check_dds, criteria_dds
from app.services.field_evaluation import check_fields
from app.services.learning_scope import scoped_check
from app.services.semantic_assessment.jobs import enqueue
from app.services.semantic_assessment.policy import DEFAULT_TEXT_WEIGHT_PERCENT


async def assess_attempt(session, attempt, card_read):
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
            check = check_dds(attempt.settings_snapshot["dds_policy"], card_read)
            criteria = criteria_dds(check)
        else:
            check = scoped_check(check_fields(source.snapshot, card_read), card_read)
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
            "instructions": card_read.instructions,
            "semantic_weight_percent": DEFAULT_TEXT_WEIGHT_PERCENT,
            "role": card_read.role,
            "learning": attempt.settings_snapshot.get("learning", {}),
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
            if attempt.settings_snapshot["dds_policy"].get("workflow") in {"crews-v1", "crews-v2"}:
                policy_snapshot["version"] = attempt.settings_snapshot["dds_policy"]["workflow"]
                policy_snapshot["weights"] = {c["code"]: float(c["max_score"]) for c in criteria}
            snapshot["dds"] = card_read.dds
            snapshot["dds_policy"] = attempt.settings_snapshot["dds_policy"]
        hint_events = list(
            await session.scalars(
                select(AttemptEvent)
                .where(
                    AttemptEvent.attempt_id == attempt.id,
                    AttemptEvent.kind == "learning.hint_issued",
                )
                .order_by(AttemptEvent.sequence)
            )
        )
        snapshot["assistance"] = {
            "issued_count": len(hint_events),
            "levels": {
                level: sum(e.payload["level"] == level for e in hint_events)
                for level in ("goal", "explanation", "solution")
            },
            "event_ids": [str(e.id) for e in hint_events],
            "scoring": "recorded_without_penalty",
        }
        snapshot["exercise_scope"] = attempt.settings_snapshot.get("exercise_scope")
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
                            "call.dialogue.speech",
                            "call.dialogue.acknowledged",
                            "call.ended",
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

        await enqueue(session, evaluation, check)
