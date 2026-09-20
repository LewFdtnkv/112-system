from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    Lesson,
    LessonEvaluation,
    ScenarioVersion,
    TrainingGroup,
    User,
)
from app.models.enums import AttemptStatus
from app.schemas.views import LessonPage, LessonRow


def lesson_rows_query(*, teacher_id: UUID | None = None, student_id: UUID | None = None):
    counts_query = select(
        Assignment.lesson_id,
        Assignment.student_id,
        func.count(Assignment.id).label("card_count"),
        func.max(Attempt.ended_at).label("last_finished_at"),
        func.count(Attempt.id).label("started_count"),
        func.count(Attempt.id)
        .filter(Attempt.status.in_([AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED]))
        .label("terminal_count"),
        func.count(Attempt.id)
        .filter(Attempt.status == AttemptStatus.COMPLETED)
        .label("completed_count"),
    ).outerjoin(Attempt, (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1))
    if teacher_id is not None:
        counts_query = counts_query.join(Lesson, Lesson.id == Assignment.lesson_id).where(
            Lesson.teacher_id == teacher_id
        )
    if student_id is not None:
        counts_query = counts_query.where(Assignment.student_id == student_id)
    counts = counts_query.group_by(Assignment.lesson_id, Assignment.student_id).subquery()
    latest = (
        select(
            LessonEvaluation.lesson_id,
            LessonEvaluation.student_id,
            LessonEvaluation.score,
            LessonEvaluation.max_score,
            LessonEvaluation.revision,
            LessonEvaluation.method,
            func.row_number()
            .over(
                partition_by=(LessonEvaluation.lesson_id, LessonEvaluation.student_id),
                order_by=LessonEvaluation.revision.desc(),
            )
            .label("rank"),
        )
        .join(
            counts,
            (counts.c.lesson_id == LessonEvaluation.lesson_id)
            & (counts.c.student_id == LessonEvaluation.student_id),
        )
        .subquery()
    )
    return (
        select(
            Lesson.id.label("lesson_id"),
            Lesson.title,
            counts.c.student_id,
            func.coalesce(
                func.nullif(
                    func.trim(
                        func.concat_ws(" ", User.last_name, User.first_name, User.middle_name)
                    ),
                    "",
                ),
                User.username,
            ).label("student_name"),
            ScenarioVersion.id.label("scenario_version_id"),
            ScenarioVersion.title.label("scenario_title"),
            ScenarioVersion.role,
            TrainingGroup.name.label("group_name"),
            Lesson.started_at,
            Lesson.ended_at,
            case(
                (
                    (Lesson.status == "finished")
                    | (counts.c.terminal_count == counts.c.card_count),
                    func.coalesce(
                        counts.c.last_finished_at,
                        Lesson.ended_at,
                        Lesson.started_at,
                        Lesson.created_at,
                    ),
                ),
                else_=None,
            ).label("completed_at"),
            Lesson.available_from,
            Lesson.available_until,
            Lesson.status,
            case(
                (Lesson.status == "finished", "submitted"),
                (counts.c.terminal_count == counts.c.card_count, "submitted"),
                (counts.c.started_count > 0, "in_progress"),
                else_="assigned",
            ).label("work_status"),
            counts.c.card_count,
            counts.c.completed_count,
            latest.c.score,
            latest.c.max_score,
            latest.c.revision.label("evaluation_revision"),
            latest.c.method.label("evaluation_method"),
        )
        .select_from(counts)
        .join(Lesson, Lesson.id == counts.c.lesson_id)
        .join(User, User.id == counts.c.student_id)
        .join(ScenarioVersion, ScenarioVersion.id == Lesson.scenario_version_id)
        .outerjoin(TrainingGroup, TrainingGroup.id == Lesson.group_id)
        .outerjoin(
            latest,
            (latest.c.lesson_id == Lesson.id)
            & (latest.c.student_id == counts.c.student_id)
            & (latest.c.rank == 1),
        )
    )


async def lesson_page(
    session: AsyncSession,
    *,
    teacher_id=None,
    student_id=None,
    lesson_id=None,
    q="",
    status="all",
    limit=20,
    offset=0,
):
    rows = lesson_rows_query(teacher_id=teacher_id, student_id=student_id).subquery()
    query = select(rows)
    if lesson_id:
        query = query.where(rows.c.lesson_id == lesson_id)
    if q:
        query = query.where(
            func.concat_ws(" ", rows.c.title, rows.c.scenario_title, rows.c.student_name).ilike(
                f"%{q}%"
            )
        )
    if status != "all":
        query = query.where(rows.c.work_status == status)
    filtered = query.subquery()
    stats = (
        await session.execute(
            select(
                func.count(),
                func.count().filter(filtered.c.work_status == "assigned"),
                func.count().filter(filtered.c.work_status == "in_progress"),
                func.count().filter(filtered.c.work_status == "submitted"),
                func.count().filter(filtered.c.score.is_not(None)),
            )
        )
    ).one()
    items = (
        (
            await session.execute(
                query.order_by(rows.c.started_at.desc(), rows.c.lesson_id, rows.c.student_id)
                .limit(limit)
                .offset(offset)
            )
        )
        .mappings()
        .all()
    )
    return LessonPage(
        items=[LessonRow.model_validate(row) for row in items],
        total=stats[0],
        limit=limit,
        offset=offset,
        assigned_count=stats[1],
        in_progress_count=stats[2],
        submitted_count=stats[3],
        graded_count=stats[4],
    )
