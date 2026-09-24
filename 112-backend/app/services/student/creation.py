from app.core.config import settings
from app.models import (
    Attempt,
    IncidentCard,
    ScenarioCard,
)
from app.models.enums import (
    CardOrigin,
    TrainingRole,
)
from app.services.assessment_policy import scenario_policy
from app.services.audit import append_event, append_student_event
from app.services.dds.initialization import initialize
from app.services.learning_scope import focused, prepared_card, skills_for


async def create_attempt(session, assignment, scenario, student_id, now):
    attempt = Attempt(
        assignment_id=assignment.id,
        student_id=student_id,
        scenario_version_id=scenario.id,
        number=1,
        mode=assignment.mode,
        started_at=now,
        settings_snapshot={
            "delivery": assignment.settings.get("delivery"),
            "response_norm_seconds": scenario.norm_seconds,
            "semantic_assessment": settings.semantic_assessment_enabled,
            "learning": assignment.settings.get("learning", {}),
            "learning_engine": assignment.settings.get("learning_engine"),
            "deadline_policy": "bpmn-v1",
            "time_limit_seconds": assignment.time_limit_seconds,
            "hint_delay_seconds": assignment.hint_delay_seconds,
            "settings": assignment.settings,
            "assessment_policy": (await scenario_policy(session, scenario.id)).model_dump(
                mode="json"
            ),
        },
    )
    session.add(attempt)
    await session.flush()
    if scenario.role == TrainingRole.DDS:
        source = await session.get(ScenarioCard, assignment.scenario_card_id)
        await initialize(session, attempt, scenario, source, now)
    else:
        initial = {}
        policy = attempt.settings_snapshot["learning"]
        if attempt.settings_snapshot.get("learning_engine") and focused(policy):
            source = await session.get(ScenarioCard, assignment.scenario_card_id)
            initial = prepared_card(source.snapshot, policy)
            attempt.settings_snapshot = attempt.settings_snapshot | {
                "exercise_scope": sorted(skills_for(policy))
            }
        session.add(
            IncidentCard(
                **initial,
                attempt_id=attempt.id,
                origin=CardOrigin.STUDENT,
                created_by_id=student_id,
                classifier_version_id=scenario.classifier_version_id,
                opened_at=now,
            )
        )
    if assignment.settings.get("delivery") == "dds-stream-v1":
        await append_event(session, attempt.id, "attempt.started", {"source": "arrival_schedule"})
    else:
        await append_student_event(session, attempt, student_id, "attempt.started", {})
    if scenario.role != TrainingRole.DDS and attempt.settings_snapshot.get("exercise_scope"):
        await append_event(
            session,
            attempt.id,
            "learning.prepared",
            {
                "editable_skills": attempt.settings_snapshot["exercise_scope"],
                "source": "scenario_card_snapshot",
            },
        )
    await session.flush()
    return attempt
