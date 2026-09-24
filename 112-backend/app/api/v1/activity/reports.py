from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.dependencies import SessionDep, TeacherDep
from app.models import (
    Lesson,
)
from app.services.activity import owned_student
from app.services.exports import export_rows
from app.services.views import lesson_rows_query

router = APIRouter(tags=["activity"])


@router.get("/teaching/reports/export")
async def report(
    session: SessionDep,
    teacher: TeacherDep,
    format: Literal["txt", "xlsx"] = "xlsx",
    student_id: UUID | None = None,
    group_id: UUID | None = None,
):
    if student_id:
        await owned_student(session, student_id, teacher.id)
    query = lesson_rows_query(teacher_id=teacher.id, student_id=student_id)
    if group_id:
        from app.services.groups import owned_group

        await owned_group(session, group_id, teacher.id)
        query = query.where(Lesson.group_id == group_id)
    data = (
        (await session.execute(query.order_by(Lesson.created_at, Lesson.id).limit(10001)))
        .mappings()
        .all()
    )
    if len(data) > 10000:
        raise HTTPException(422, "Narrow the report to a group or student (maximum 10000 rows)")
    return export_rows(
        [
            "Ученик",
            "Задание",
            "Группа",
            "Выполнено карточек",
            "Всего карточек",
            "Балл",
            "Максимум",
            "Метод оценки",
        ],
        [
            [
                r["student_name"],
                r["title"],
                r["group_name"],
                r["completed_count"],
                r["card_count"],
                r["score"],
                r["max_score"],
                r["evaluation_method"],
            ]
            for r in data
        ],
        format,
        "training-report",
    )
