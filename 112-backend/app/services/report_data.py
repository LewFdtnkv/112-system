"""Batch read of frozen evidence shared by exports and group learning summaries."""

from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import select, tuple_

from app.models import (
    Assignment,
    Attempt,
    CriterionResult,
    Evaluation,
    IncidentCard,
    LessonEvaluation,
    ScenarioCard,
)
from app.services.error_analytics.checks import observations
from app.services.learning_recommendations.profile import credits_for
from app.services.semantic_assessment.results import card_score, jobs_for

AI_STATUS = {
    "queued": "В очереди",
    "running": "Проверяется",
    "succeeded": "Завершена",
    "failed": "Недоступна",
    "not_applicable": "Не требуется",
}
CHECK_STATUS = {
    "missing": "Не выполнено",
    "different": "Расхождение",
    "matched": "Верно",
    "correct": "Верно",
    "partial": "Частично верно",
    "incorrect": "Неверно",
    "uncertain": "Нужна проверка",
}


async def card_results(session, lesson_rows, *, analytics=False):
    owners = {(r["lesson_id"], r["student_id"]): r for r in lesson_rows}
    if not owners:
        return []
    assignments = (
        await session.execute(
            select(Assignment, Attempt, IncidentCard)
            .outerjoin(Attempt, (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1))
            .outerjoin(IncidentCard, IncidentCard.attempt_id == Attempt.id)
            .where(tuple_(Assignment.lesson_id, Assignment.student_id).in_(list(owners)))
            .order_by(Assignment.lesson_id, Assignment.student_id, Assignment.position)
            .limit(10001)
        )
    ).all()
    if len(assignments) > 10000:
        raise HTTPException(422, "Сократите период отчёта: допускается до 10000 карточек.")
    snapshots = (
        {
            s.id: s
            for s in await session.scalars(
                select(ScenarioCard).where(
                    ScenarioCard.id.in_([a.scenario_card_id for a, _, _ in assignments])
                )
            )
        }
        if analytics
        else {}
    )
    ids = [a.id for _, a, _ in assignments if a]
    evaluations = {
        e.attempt_id: e
        for e in await session.scalars(
            select(Evaluation).where(Evaluation.attempt_id.in_(ids)).order_by(Evaluation.revision)
        )
    }
    criteria = defaultdict(list)
    for c in await session.scalars(
        select(CriterionResult).where(
            CriterionResult.evaluation_id.in_([e.id for e in evaluations.values()])
        )
    ):
        criteria[c.evaluation_id].append(c)
    jobs = {j.attempt_id: j for j in await jobs_for(session, ids)}
    grades = {
        (g.lesson_id, g.student_id): g
        for g in await session.scalars(
            select(LessonEvaluation)
            .where(
                tuple_(LessonEvaluation.lesson_id, LessonEvaluation.student_id).in_(list(owners))
            )
            .order_by(LessonEvaluation.revision)
        )
    }
    result = []
    for assignment, attempt, card in assignments:
        row = owners[assignment.lesson_id, assignment.student_id]
        grade = grades.get((assignment.lesson_id, assignment.student_id))
        evaluation = evaluations.get(attempt.id) if attempt else None
        checks = criteria[evaluation.id] if evaluation else []
        job = jobs.get(attempt.id) if attempt else None
        score, maximum, _ = card_score(evaluation, checks, job) if evaluation else (None, None, [])
        result.append(
            {
                "lesson_id": str(assignment.lesson_id),
                "student_id": str(assignment.student_id),
                "assignment_id": str(assignment.id),
                "position": assignment.position,
                "student": row["student_name"],
                "lesson": row["title"],
                "role": str(row["role"]),
                "received_at": attempt.started_at.isoformat() if attempt else None,
                "kind": (row["learning"] or {}).get("kind", "practice"),
                "number": card.display_number if card else None,
                "status": str(attempt.status) if attempt else "pending",
                "score": float(score) if score is not None else None,
                "max_score": float(maximum) if maximum is not None else None,
                "evaluation_id": str(evaluation.id) if evaluation else None,
                "grade_revision": grade.revision if grade else 0,
                "teacher_reviewed": bool(grade and grade.method == "teacher"),
                "teacher_review": grade.comment if grade and grade.method == "teacher" else None,
                "timing": (evaluation.context_snapshot.get("dds") or {}).get("timing")
                if evaluation
                else None,
                "credits": credits_for(evaluation, checks, job) if evaluation else {},
                "fields": [
                    {**f, "criterion": c.code}
                    for c in checks
                    for f in c.criterion_snapshot.get("fields", [])
                ],
                "ai_status": str(job.status) if job else "not_applicable",
                "ai_job": str(job.id) if job else None,
                "findings": (job.output or {}).get("findings", []) if job else [],
            }
        )
        if analytics:
            source = snapshots.get(assignment.scenario_card_id)
            result[-1].update(
                completed_at=attempt.ended_at.isoformat() if attempt and attempt.ended_at else None,
                template_key=str(
                    source.card_template_id if source else assignment.scenario_version_id
                ),
                card_title=source.snapshot.get("title", "Учебная карточка")
                if source
                else row["scenario_title"],
                analytics_checks=observations(evaluation, checks, job) if evaluation else [],
            )
    return result


def detail_sheets(cards):
    details, errors = [], []
    for card in cards:
        identity = [card["student"], card["lesson"], card["position"], card["number"] or "—"]
        times = []
        for key in ("opening", "first_record"):
            t = (card["timing"] or {}).get(key)
            times.extend(
                [
                    t["at"] if t and t["at"] else "Не выполнено" if t else "—",
                    round(t["seconds"], 1) if t and t["at"] else "—",
                    t["norm_seconds"] if t else "—",
                    round(max(0, t["seconds"] - t["norm_seconds"]), 1) if t and t["at"] else "—",
                ]
            )
        details.append(
            identity
            + [
                "ДДС" if card["role"] == "dds" else "112",
                {
                    "completed": "Завершена",
                    "interrupted": "Прервана",
                    "in_progress": "Выполняется",
                    "pending": "Не начата",
                }.get(card["status"], card["status"]),
                card["score"],
                card["max_score"],
                card["received_at"] or "",
                *times,
                AI_STATUS.get(card["ai_status"], card["ai_status"]),
                card["teacher_review"] or "",
            ]
        )
        for f in card["fields"]:
            if f["scored"] and f["status"] != "matched":
                errors.append(
                    identity
                    + [
                        f["label"],
                        f["expected"],
                        f["actual"],
                        CHECK_STATUS.get(f["status"], f["status"]),
                        "Правила",
                        "",
                    ]
                )
        for f in card["findings"]:
            errors.append(
                identity
                + [
                    f["label"],
                    "",
                    f["reason"],
                    CHECK_STATUS.get(f.get("verdict"), "Нужна проверка"),
                    "ИИ — учтено" if f.get("applied") else "ИИ — не учтено",
                    f.get("recommendation", ""),
                ]
            )
    headers = ["Ученик", "Занятие", "Позиция карточки", "Номер происшествия"]
    return [
        (
            "Карточки",
            headers
            + [
                "Оператор",
                "Работа с карточкой",
                "Балл карточки",
                "Максимум",
                "Поступление (UTC)",
                "Открытие (UTC)",
                "Открытие, с",
                "Норматив открытия, с",
                "Превышение открытия, с",
                "Первая запись (UTC)",
                "Первая запись, с",
                "Норматив записи, с",
                "Превышение записи, с",
                "Проверка ИИ",
                "Пересмотр преподавателем итогов занятия",
            ],
            details,
        ),
        (
            "Ошибки и комментарии",
            headers
            + [
                "Проверка",
                "Ожидалось",
                "Ответ / комментарий",
                "Результат",
                "Источник",
                "Рекомендация",
            ],
            errors,
        ),
    ]
