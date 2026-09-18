from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep, TeacherDep
from app.models import Assignment, CardTemplate, Lesson, Scenario, ScenarioVersion
from app.schemas.authoring import (
    AssignmentRead,
    CardCreate,
    CardListItem,
    CardRead,
    LessonRead,
    LessonStart,
    ScenarioCreate,
    ScenarioListItem,
    ScenarioRead,
)
from app.services.authoring import (
    card_read,
    create_card,
    create_scenario,
    owned_card,
    owned_scenario,
    scenario_read,
)
from app.services.lessons import lesson_read, lesson_reads, owned_lesson, start_lesson

router = APIRouter(tags=["teacher authoring"])
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.post("/cards", response_model=CardRead, status_code=201)
async def post_card(payload: CardCreate, session: SessionDep, teacher: TeacherDep):
    return await create_card(session, teacher.id, payload)


@router.get("/cards", response_model=list[CardListItem])
async def list_cards(
    session: SessionDep, teacher: TeacherDep, limit: Limit = 20, offset: Offset = 0
):
    return list(
        await session.scalars(
            select(CardTemplate)
            .where(
                CardTemplate.created_by_id == teacher.id,
            )
            .order_by(CardTemplate.created_at, CardTemplate.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/cards/{card_id}", response_model=CardRead)
async def get_card(card_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await card_read(session, await owned_card(session, card_id, teacher.id))


@router.post("/scenarios", response_model=ScenarioRead, status_code=201)
async def post_scenario(payload: ScenarioCreate, session: SessionDep, teacher: TeacherDep):
    return await create_scenario(session, teacher.id, payload)


@router.get("/scenarios", response_model=list[ScenarioListItem])
async def list_scenarios(
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return list(
        await session.scalars(
            select(ScenarioVersion)
            .join(Scenario)
            .where(
                Scenario.created_by_id == teacher.id,
            )
            .order_by(ScenarioVersion.created_at, ScenarioVersion.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/scenarios/{version_id}", response_model=ScenarioRead)
async def get_scenario(version_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await scenario_read(session, await owned_scenario(session, version_id, teacher.id))


@router.post("/lessons/start", response_model=LessonRead, status_code=201)
async def post_lesson(
    payload: LessonStart,
    session: SessionDep,
    teacher: TeacherDep,
    response: Response,
):
    lesson, created = await start_lesson(session, teacher.id, payload)
    response.status_code = 201 if created else 200
    return lesson


@router.get("/lessons", response_model=list[LessonRead])
async def list_lessons(
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    lessons = list(
        await session.scalars(
            select(Lesson)
            .where(
                Lesson.teacher_id == teacher.id,
            )
            .order_by(Lesson.created_at, Lesson.id)
            .limit(limit)
            .offset(offset)
        )
    )
    return await lesson_reads(session, lessons)


@router.get("/lessons/{lesson_id}", response_model=LessonRead)
async def get_lesson(lesson_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await lesson_read(session, await owned_lesson(session, lesson_id, teacher.id))


@router.get("/lessons/{lesson_id}/assignments", response_model=list[AssignmentRead])
async def list_assignments(
    lesson_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    student_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    await owned_lesson(session, lesson_id, teacher.id)
    query = select(Assignment).where(Assignment.lesson_id == lesson_id)
    if student_id is not None:
        query = query.where(Assignment.student_id == student_id)
    return list(
        await session.scalars(
            query.order_by(
                Assignment.student_id,
                Assignment.position,
            )
            .limit(limit)
            .offset(offset)
        )
    )
