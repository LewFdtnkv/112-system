"""Versioned arithmetic; late AI never overwrites a teacher's decision."""

from decimal import ROUND_HALF_UP, Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from app.models import AIJob, Assignment, Attempt, CriterionResult, Evaluation, LessonEvaluation
from app.models.enums import AIPurpose, EvaluationMethod, JobStatus
from app.schemas.semantic_assessment import SemanticReview, SemanticSummary
from app.services.semantic_assessment.policy import text_weight


async def jobs_for(session, attempt_ids):
    return list(
        await session.scalars(
            select(AIJob)
            .where(
                AIJob.attempt_id.in_(attempt_ids),
                AIJob.purpose == AIPurpose.EVALUATION,
            )
            .order_by(AIJob.created_at)
        )
    )


def summary(jobs):
    findings = [f for j in jobs for f in (j.output or {}).get("findings", [])]
    pending = sum(j.status in (JobStatus.QUEUED, JobStatus.RUNNING) for j in jobs)
    failed = sum(j.status == JobStatus.FAILED for j in jobs)
    unresolved = sum(not f["applied"] for f in findings)
    weights = {text_weight(j.input) for j in jobs}
    return SemanticSummary(
        semantic_weight_percent=next(iter(weights)) if len(weights) == 1 else None,
        policy_version="semantic-v2" if weights - {20} else "semantic-v1",
        status="pending"
        if pending
        else "not_applicable"
        if not jobs
        else "unavailable"
        if failed == len(jobs)
        else "partial"
        if failed or unresolved
        else "complete",
        pending_cards=pending,
        failed_cards=failed,
        needs_review=unresolved,
        reviewed_cards=sum(j.status == JobStatus.SUCCEEDED for j in jobs),
        applied_criteria=sum(f["applied"] for f in findings),
    ).model_dump()


def review(job):
    return SemanticReview(
        status=job.status,
        model=job.model_version,
        prompt_version=job.prompt_version,
        findings=(job.output or {}).get("findings", []),
        process=job.input.get("process", {}),
        error=job.error,
        retrieval=(job.output or {}).get("retrieval", {}),
    )


def card_score(evaluation, criteria, job):
    score, maximum = evaluation.score, evaluation.max_score
    findings = (
        (job.output or {}).get("findings", []) if job and job.status == JobStatus.SUCCEEDED else []
    )
    adjustments = [
        {
            "code": c.code,
            "label": c.criterion_snapshot.get("label", c.code),
            "score": float(c.score),
            "max_score": float(c.max_score),
            "explanation": c.explanation,
        }
        for c in criteria
    ]
    for finding in findings:
        if finding["code"] == "additional_services" and finding["applied"]:
            group = next((c for c in criteria if c.code == "notification"), None)
            if group:
                awarded = group.max_score * Decimal(str(finding["credit"]))
                score += awarded - group.score
                item = next(c for c in adjustments if c["code"] == "notification")
                item["score"] = float(awarded)
                item["explanation"] = finding["reason"]
    text = [f for f in findings if f["code"] != "additional_services"]
    # Unresolved criteria have no invented credit. Formal results remain explicitly partial.
    if text and all(f["applied"] for f in text):
        credit = sum(Decimal(str(f["credit"])) for f in text) / len(text)
        presence_only = all(
            all(
                f["field"] in {"description", "address_text"}
                for f in c.criterion_snapshot["fields"]
            )
            for c in criteria
        )
        if presence_only:
            score = maximum * credit
            weight = maximum
            adjustments = []
        else:
            percent = Decimal(text_weight(evaluation.context_snapshot))
            weight = maximum * percent / (100 - percent)
            score += weight * credit
            maximum += weight
        adjustments.append(
            {
                "code": "semantic_text",
                "label": "Смысл и согласованность свободных полей",
                "score": float(weight * credit),
                "max_score": float(weight),
                "explanation": "Отдельные смысловые критерии имеют равный вес. "
                + (
                    "В упражнении на текст заменена проверка наличия."
                    if presence_only
                    else f"Доля смысловой проверки — {percent}%."
                ),
            }
        )
    return score, maximum, adjustments


async def publish_result(session, lesson, student_id):
    latest = await session.scalar(
        select(LessonEvaluation)
        .where(
            LessonEvaluation.lesson_id == lesson.id,
            LessonEvaluation.student_id == student_id,
        )
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    if not latest or latest.method == "teacher":
        return
    rows = (
        await session.execute(
            select(Assignment.id, Attempt.id)
            .outerjoin(Attempt, (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1))
            .where(Assignment.lesson_id == lesson.id, Assignment.student_id == student_id)
        )
    ).all()
    ids = [attempt for _, attempt in rows if attempt]
    jobs = await jobs_for(session, ids)
    info = summary(jobs)
    if info["status"] in {"pending", "not_applicable"}:
        return
    key = uuid5(
        NAMESPACE_URL,
        "system112:semantic-result:" + ":".join(f"{j.id}:{j.retry_count}:{j.status}" for j in jobs),
    )
    if await session.scalar(select(LessonEvaluation.id).where(LessonEvaluation.request_id == key)):
        return
    rules = list(
        await session.scalars(
            select(Evaluation).where(
                Evaluation.attempt_id.in_(ids), Evaluation.method == EvaluationMethod.RULES
            )
        )
    )
    criteria = list(
        await session.scalars(
            select(CriterionResult).where(CriterionResult.evaluation_id.in_([e.id for e in rules]))
        )
    )
    totals, adjustments = [], []
    for evaluation in rules:
        score, maximum, changes = card_score(
            evaluation,
            [c for c in criteria if c.evaluation_id == evaluation.id],
            next((j for j in jobs if j.attempt_id == evaluation.attempt_id), None),
        )
        totals.append((score, maximum))
        adjustments.extend(changes)
    if len(ids) < len(rows):
        percent = sum((100 * s / m for s, m in totals), Decimal(0)) / len(rows)
    else:
        percent = (
            100 * sum((s for s, _ in totals), Decimal(0)) / sum((m for _, m in totals), Decimal(0))
        )
    base = await session.scalar(
        select(LessonEvaluation).where(
            LessonEvaluation.lesson_id == lesson.id,
            LessonEvaluation.student_id == student_id,
            LessonEvaluation.revision == 1,
        )
    )
    details = dict(base.assessment_details)
    grouped = {}
    for item in adjustments:
        if item["code"] not in grouped:
            grouped[item["code"]] = dict(item)
        else:
            grouped[item["code"]]["score"] += item["score"]
            grouped[item["code"]]["max_score"] += item["max_score"]
            grouped[item["code"]]["explanation"] = (
                "Сумма по карточкам урока; основания в разборе карточек."
            )
    details.update(
        {
            "semantic": info,
            "scope": "hybrid" if info["status"] == "complete" else "partial",
            "criteria": list(grouped.values()),
            "policy_version": info["policy_version"],
            "recommendations": list(
                dict.fromkeys(
                    f["recommendation"]
                    for j in jobs
                    for f in (j.output or {}).get("findings", [])
                    if f.get("applied") and f.get("recommendation") and f.get("credit", 1) < 1
                )
            )[:20],
        }
    )
    session.add(
        LessonEvaluation(
            lesson_id=lesson.id,
            student_id=student_id,
            reviewer_id=None,
            request_id=key,
            revision=latest.revision + 1,
            supersedes_id=latest.id,
            method="hybrid" if info["applied_criteria"] else "rules",
            score=percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            max_score=100,
            comment="Автоматическая оценка по правилам и смысловым критериям. "
            + (
                "Смысловая проверка завершена."
                if info["status"] == "complete"
                else "Проверка неполная: спорные или недоступные решения ИИ "
                "не изменили формальную оценку."
            ),
            assessment_details=details,
        )
    )
    await session.flush()


async def reconcile(session):
    """Recover publication after a worker died between a terminal failure and aggregation."""
    from sqlalchemy import func

    from app.models import Lesson

    latest = (
        select(
            LessonEvaluation.lesson_id,
            LessonEvaluation.student_id,
            func.max(LessonEvaluation.revision).label("revision"),
        )
        .group_by(LessonEvaluation.lesson_id, LessonEvaluation.student_id)
        .subquery()
    )
    pending = list(
        await session.scalars(
            select(LessonEvaluation)
            .join(
                latest,
                (latest.c.lesson_id == LessonEvaluation.lesson_id)
                & (latest.c.student_id == LessonEvaluation.student_id)
                & (latest.c.revision == LessonEvaluation.revision),
            )
            .where(
                LessonEvaluation.method == "rules",
                LessonEvaluation.assessment_details["semantic"]["status"].astext == "pending",
            )
            .order_by(LessonEvaluation.created_at)
            .limit(50)
        )
    )
    for grade in pending:
        lesson = await session.scalar(
            select(Lesson).where(Lesson.id == grade.lesson_id).with_for_update()
        )
        await publish_result(session, lesson, grade.student_id)
        await session.commit()
