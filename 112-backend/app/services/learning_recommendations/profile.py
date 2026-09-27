"""Evidence-derived skill trends, with one observation per card and skill."""

from collections import Counter, defaultdict

from sqlalchemy import select

from app.core.fingerprints import context_hash
from app.models import (
    AIJob,
    Assignment,
    Attempt,
    CriterionResult,
    Evaluation,
    Lesson,
    LessonEvaluation,
)
from app.models.enums import AIPurpose, EvaluationMethod
from app.services.learning_scope import field_skill
from app.services.semantic_assessment.rule_review import field_adjustments

LABELS = {
    "address": "Заполнение адреса",
    "caller": "Сведения о заявителе",
    "classification": "Классификация происшествий",
    "notification": "Выбор служб",
    "description": "Описание происшествия",
    "dds_crews": "Назначение бригад",
    "dds_response": "Статусы и сообщения бригад",
}
MIN_CARDS = 3
RECENT_LESSONS = 5


def aggregate(observations):
    """Input is chronological; absence of a tested skill is not a zero."""
    overall = defaultdict(list)
    for observation in observations:
        for skill, credit in observation["credits"].items():
            overall[skill].append({**observation, "credit": credit})
    recent_lessons = list(dict.fromkeys(o["lesson_id"] for o in observations))[-RECENT_LESSONS:]
    skills = {}
    for skill, history in sorted(overall.items()):
        recent = [o for o in history if o["lesson_id"] in recent_lessons]
        if len(recent) < MIN_CARDS or len({o["lesson_id"] for o in recent}) < 2:
            continue
        correct = sum(o["credit"] >= 0.999 for o in recent)
        errors = len(recent) - correct
        independent = [o for o in recent if not o["assisted"]]
        latest = recent[-3:]
        previous = recent[-6:-3]
        trend = "insufficient"
        if len(previous) == 3:
            delta = sum(o["credit"] for o in latest) - sum(o["credit"] for o in previous)
            trend = "improving" if delta >= 0.6 else "declining" if delta <= -0.6 else "stable"
        signal = (
            "regression"
            if errors >= 2 and trend == "declining"
            else "practice"
            if errors >= 2
            else "independent"
            if correct == len(recent) and len(independent) < 3
            else "ready"
            if len(independent) >= 3 and all(o["credit"] >= 0.999 for o in independent[-3:])
            else "insufficient"
        )
        skills[skill] = {
            "label": LABELS[skill],
            "cards": len(recent),
            "correct": correct,
            "errors": errors,
            "assisted": sum(o["assisted"] for o in recent),
            "independent_cards": len(independent),
            "trend": trend,
            "signal": signal,
            "overall_cards": len(history),
            "overall_percent": round(100 * sum(o["credit"] for o in history) / len(history)),
            "recent_percent": round(100 * sum(o["credit"] for o in recent) / len(recent)),
            "recurring_fields": [
                {"label": label, "cards": count}
                for label, count in Counter(
                    label
                    for o in recent
                    for label in sorted(set(o.get("issues", {}).get(skill, [])))
                ).most_common(3)
                if count >= 2
            ],
        }
    # At most two study priorities. Progress/strengths are accompanying evidence, not more tasks.
    priority = {"regression": 0, "practice": 1, "independent": 2}
    candidates = sorted(
        (key for key in skills if skills[key]["signal"] in priority),
        key=lambda key: (priority[skills[key]["signal"]], -skills[key]["errors"], key),
    )[:2]
    return {"skills": skills, "candidates": candidates, "recent_lesson_count": len(recent_lessons)}


def credits_for(evaluation, criteria, semantic):
    credits = defaultdict(list)
    findings = (semantic.output or {}).get("findings", []) if semantic else []
    corrections = field_adjustments(evaluation, semantic, findings)
    for criterion in criteria:
        for field in criterion.criterion_snapshot.get("fields", []):
            if not field.get("scored"):
                continue
            path = field["field"]
            skill = (
                "dds_crews"
                if path.startswith(("dds.assignment.", "dds.notification."))
                else "dds_response"
                if path.startswith(("dds.status.", "dds.crew.", "dds.timing."))
                else field_skill(path)
            )
            if skill not in LABELS or skill == "description" or path == "address_text":
                continue  # Presence is not evidence of semantic quality.
            credit = float(field["status"] == "matched")
            correction = corrections.get(path)
            if correction and correction["before"] == credit:
                credit = correction["after"]
            credits[skill].append(credit)
    if semantic:
        if any(c["code"] == "additional_services" for c in semantic.input.get("criteria", [])):
            # A failed/pending semantic job has no findings at all. Its formal penalty
            # for additional recipients still cannot prove a skill error.
            credits.pop("notification", None)
        rule_codes = {c["code"] for c in semantic.input.get("criteria", []) if "rule_check" in c}
        for finding in findings:
            code = finding["code"]
            if code in rule_codes:
                continue  # Already included in the original field, not an extra text criterion.
            if code == "additional_services":
                # Unresolved extra recipients must not become an accusation of a wrong service.
                credits.pop("notification", None)
                if finding.get("applied"):
                    credits["notification"] = [float(finding["credit"])]
            elif finding.get("applied"):
                skill = "dds_response" if code == "dds.comments" else field_skill(code)
                if skill in LABELS:
                    credits[skill].append(float(finding["credit"]))
    return {skill: sum(values) / len(values) for skill, values in credits.items() if values}


def issues_for(criteria, credits, corrections=None):
    """Name repeated exact field discrepancies, never copy answer values into advice."""
    issues = defaultdict(list)
    for criterion in criteria:
        for field in criterion.criterion_snapshot.get("fields", []):
            path = field["field"]
            skill = field_skill(path)
            credit = float(field["status"] == "matched")
            correction = (corrections or {}).get(path)
            if correction and correction["before"] == credit:
                credit = correction["after"]
            if (
                field.get("scored")
                and credit < 0.999
                and skill in credits
                and credits[skill] < 0.999
                and path not in {"address_text", "description"}
            ):
                issues[skill].append(field["label"])
    return dict(issues)


async def build_profile(session, student_id, role):
    grades = list(
        await session.scalars(
            select(LessonEvaluation)
            .where(LessonEvaluation.student_id == student_id)
            .distinct(LessonEvaluation.lesson_id)
            .order_by(LessonEvaluation.lesson_id, LessonEvaluation.revision.desc())
        )
    )
    lessons = {
        lesson.id: lesson
        for lesson in await session.scalars(
            select(Lesson).where(Lesson.id.in_([g.lesson_id for g in grades]))
        )
    }
    accepted = {
        g.lesson_id: g
        for g in grades
        if g.method != "teacher"
        and lessons[g.lesson_id].status != "cancelled"
        and (g.assessment_details or {}).get("semantic", {}).get("status") != "pending"
    }
    # A manual total grade is authoritative but does not describe which skill changed.
    # Exclude that lesson instead of reusing its superseded automatic judgments.
    rows = (
        await session.execute(
            select(Evaluation, Attempt, Assignment)
            .join(Attempt, Attempt.id == Evaluation.attempt_id)
            .join(Assignment, Assignment.id == Attempt.assignment_id)
            .where(
                Attempt.student_id == student_id,
                Assignment.lesson_id.in_(accepted),
                Evaluation.method == EvaluationMethod.RULES,
                Attempt.status == "completed",
            )
            .order_by(Attempt.ended_at, Attempt.id)
        )
    ).all()
    rows = [r for r in rows if r[0].context_snapshot.get("role") == role]
    criteria = defaultdict(list)
    for criterion in await session.scalars(
        select(CriterionResult).where(CriterionResult.evaluation_id.in_([e.id for e, _, _ in rows]))
    ):
        criteria[criterion.evaluation_id].append(criterion)
    semantic = {
        j.attempt_id: j
        for j in await session.scalars(
            select(AIJob)
            .where(
                AIJob.attempt_id.in_([a.id for _, a, _ in rows]),
                AIJob.purpose == AIPurpose.EVALUATION,
            )
            .order_by(AIJob.created_at, AIJob.id)
        )
    }
    observations, sources = [], {}
    for evaluation, attempt, assignment in rows:
        snapshot = evaluation.context_snapshot
        if snapshot.get("learning", {}).get("kind") in {"introduction", "worked_example"}:
            continue  # Guided examples never prove independent proficiency.
        assisted = snapshot.get("assistance", {}).get("issued_count", 0) > 0
        credits = credits_for(evaluation, criteria[evaluation.id], semantic.get(attempt.id))
        job = semantic.get(attempt.id)
        corrections = field_adjustments(
            evaluation, job, (job.output or {}).get("findings", []) if job else []
        )
        observations.append(
            {
                "lesson_id": str(assignment.lesson_id),
                "assisted": assisted,
                "credits": credits,
                "issues": issues_for(criteria[evaluation.id], credits, corrections),
            }
        )
        sources[str(assignment.lesson_id)] = str(accepted[assignment.lesson_id].id)
    profile = aggregate(observations)
    profile.update(
        role=role, sources=sources, assessed_cards=len(observations), version="study-profile-v1"
    )
    profile["fingerprint"] = context_hash(profile)
    profile["signature"] = context_hash(
        {
            k: {
                "signal": profile["skills"][k]["signal"],
                "fields": sorted(f["label"] for f in profile["skills"][k]["recurring_fields"]),
            }
            for k in profile["candidates"]
        }
    )
    return profile
