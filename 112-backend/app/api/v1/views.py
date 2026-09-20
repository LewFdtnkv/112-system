from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.dependencies import AdminDep, SessionDep, StaffDep, StudentDep, TeacherDep
from app.api.v1.authoring import Limit, Offset
from app.models import (
    CardTemplate,
    ClassifierVersion,
    GroupMembership,
    Scenario,
    ScenarioCard,
    ScenarioVersion,
    Service,
    TrainingGroup,
    User,
)
from app.schemas.authoring import CardListItem
from app.schemas.catalog import ServiceRead
from app.schemas.catalog_admin import ClassifierAdminRead
from app.schemas.views import (
    AnalyticsRead,
    AnalyticsRow,
    GroupItem,
    LessonPage,
    Page,
    ScenarioItem,
    UserItem,
)
from app.services.activity import owned_student
from app.services.groups import owned_group
from app.services.views import lesson_page, lesson_rows_query

router = APIRouter(prefix="/views", tags=["frontend pages"])
Search = Annotated[str, Query(max_length=200)]


async def page_rows(session, query, limit, offset):
    total = await session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    return total, (await session.execute(query.limit(limit).offset(offset))).all()


@router.get("/users", response_model=Page[UserItem])
async def users(
    session: SessionDep,
    staff: StaffDep,
    q: Search = "",
    role: Literal["all", "student", "teacher", "admin"] = "all",
    group_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    query = select(User)
    if group_id:
        if not staff.is_teacher:
            # Admin is allowed the account directory, not another teacher's group management.
            from fastapi import HTTPException

            raise HTTPException(status_code=403, detail="Teacher access required")
        await owned_group(session, group_id, staff.id)
        query = query.join(GroupMembership, GroupMembership.user_id == User.id).where(
            GroupMembership.group_id == group_id
        )
    if role == "student":
        query = query.where(User.is_admin.is_(False), User.is_teacher.is_(False))
    elif role == "teacher":
        query = query.where(User.is_teacher.is_(True))
    elif role == "admin":
        query = query.where(User.is_admin.is_(True))
    if q:
        query = query.where(
            func.concat_ws(
                " ", User.username, User.first_name, User.last_name, User.middle_name, User.email
            ).ilike(f"%{q}%")
        )
    total, rows = await page_rows(
        session, query.order_by(User.last_name, User.first_name, User.id), limit, offset
    )
    items = [UserItem.model_validate(row[0]) for row in rows]
    group_query = (
        select(GroupMembership.user_id, TrainingGroup.name)
        .join(TrainingGroup)
        .where(GroupMembership.user_id.in_([item.id for item in items]))
    )
    if not staff.is_admin:
        group_query = group_query.where(TrainingGroup.teacher_id == staff.id)
    names = {}
    if items:
        for user_id, name in (
            await session.execute(group_query.order_by(TrainingGroup.name))
        ).all():
            names.setdefault(user_id, []).append(name)
    for item in items:
        item.groups = names.get(item.id, [])
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/groups", response_model=Page[GroupItem])
async def groups(
    session: SessionDep, teacher: TeacherDep, q: Search = "", limit: Limit = 20, offset: Offset = 0
):
    query = (
        select(
            TrainingGroup.id,
            TrainingGroup.name,
            func.count(GroupMembership.user_id).label("student_count"),
        )
        .outerjoin(GroupMembership)
        .where(TrainingGroup.teacher_id == teacher.id)
    )
    if q:
        query = query.where(TrainingGroup.name.ilike(f"%{q}%"))
    query = query.group_by(TrainingGroup.id).order_by(TrainingGroup.name, TrainingGroup.id)
    total, rows = await page_rows(session, query, limit, offset)
    return Page(
        items=[GroupItem.model_validate(row._mapping) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/scenarios", response_model=Page[ScenarioItem])
async def scenarios(
    session: SessionDep,
    teacher: TeacherDep,
    q: Search = "",
    status: Literal["all", "draft", "published"] = "all",
    limit: Limit = 20,
    offset: Offset = 0,
):
    latest = (
        select(ScenarioVersion.scenario_id, func.max(ScenarioVersion.version).label("version"))
        .group_by(ScenarioVersion.scenario_id)
        .subquery()
    )
    query = (
        select(ScenarioVersion, func.count(ScenarioCard.id).label("card_count"))
        .join(Scenario)
        .join(
            latest,
            (latest.c.scenario_id == ScenarioVersion.scenario_id)
            & (latest.c.version == ScenarioVersion.version),
        )
        .outerjoin(ScenarioCard)
        .where(Scenario.created_by_id == teacher.id, Scenario.is_archived.is_(False))
    )
    if q:
        query = query.where(
            func.concat_ws(" ", ScenarioVersion.title, ScenarioVersion.category).ilike(f"%{q}%")
        )
    if status != "all":
        query = query.where(ScenarioVersion.status == status)
    query = query.group_by(ScenarioVersion.id).order_by(
        ScenarioVersion.created_at.desc(), ScenarioVersion.id
    )
    total, rows = await page_rows(session, query, limit, offset)
    return Page(
        items=[
            ScenarioItem.model_validate(
                {
                    **{
                        key: getattr(version, key)
                        for key in ScenarioItem.model_fields
                        if key != "card_count"
                    },
                    "card_count": count,
                }
            )
            for version, count in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/cards", response_model=Page[CardListItem])
async def cards(
    session: SessionDep,
    teacher: TeacherDep,
    q: Search = "",
    classifier_version_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    query = select(CardTemplate).where(CardTemplate.created_by_id == teacher.id)
    if q:
        query = query.where(CardTemplate.title.ilike(f"%{q}%"))
    if classifier_version_id:
        query = query.where(CardTemplate.classifier_version_id == classifier_version_id)
    total, rows = await page_rows(
        session, query.order_by(CardTemplate.created_at.desc(), CardTemplate.id), limit, offset
    )
    return Page(
        items=[CardListItem.model_validate(row[0]) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/lessons", response_model=LessonPage)
async def teacher_lessons(
    session: SessionDep,
    teacher: TeacherDep,
    q: Search = "",
    status: Literal["all", "assigned", "in_progress", "submitted"] = "all",
    lesson_id: UUID | None = None,
    student_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    if student_id is not None:
        await owned_student(session, student_id, teacher.id)
    return await lesson_page(
        session,
        teacher_id=teacher.id,
        student_id=student_id,
        lesson_id=lesson_id,
        q=q,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/student/lessons", response_model=LessonPage)
async def student_lessons(
    session: SessionDep,
    student: StudentDep,
    q: Search = "",
    status: Literal["all", "assigned", "in_progress", "submitted"] = "all",
    limit: Limit = 20,
    offset: Offset = 0,
):
    return await lesson_page(
        session, student_id=student.id, q=q, status=status, limit=limit, offset=offset
    )


@router.get("/analytics", response_model=AnalyticsRead)
async def analytics(
    session: SessionDep,
    teacher: TeacherDep,
    scenario_version_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    base = lesson_rows_query(teacher_id=teacher.id).subquery()
    query = select(base)
    if scenario_version_id:
        query = query.where(base.c.scenario_version_id == scenario_version_id)
    rows = query.subquery()
    measures = [
        func.count().label("total"),
        func.count().filter(rows.c.work_status == "submitted").label("submitted"),
        func.count(rows.c.score).label("graded"),
        func.avg(rows.c.score * 100 / rows.c.max_score).label("average_score_percent"),
    ]
    summary = (await session.execute(select(*measures))).mappings().one()
    by_scenario = (
        select(rows.c.scenario_version_id, rows.c.scenario_title.label("title"), *measures)
        .group_by(rows.c.scenario_version_id, rows.c.scenario_title)
        .order_by(rows.c.scenario_title, rows.c.scenario_version_id)
    )
    total, records = await page_rows(session, by_scenario, limit, offset)
    return AnalyticsRead(
        **summary,
        scenarios=Page(
            items=[AnalyticsRow.model_validate(row._mapping) for row in records],
            total=total,
            limit=limit,
            offset=offset,
        ),
    )


@router.get("/admin/dashboard")
async def admin_dashboard(session: SessionDep, admin: AdminDep):
    # Aggregate counts only, not lists of accounts or hidden teaching material.
    return {
        "users": await session.scalar(select(func.count()).select_from(User)),
        "services": await session.scalar(select(func.count()).select_from(Service)),
        "classifiers": await session.scalar(select(func.count()).select_from(ClassifierVersion)),
    }


@router.get("/admin/services", response_model=Page[ServiceRead])
async def admin_services(
    session: SessionDep, admin: AdminDep, q: Search = "", limit: Limit = 20, offset: Offset = 0
):
    query = select(Service).where(Service.is_active.is_(True))
    if q:
        query = query.where(
            func.concat_ws(" ", Service.code, Service.name, Service.short_name).ilike(f"%{q}%")
        )
    total, rows = await page_rows(session, query.order_by(Service.code, Service.id), limit, offset)
    return Page(
        items=[ServiceRead.model_validate(row[0]) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/admin/classifiers", response_model=Page[ClassifierAdminRead])
async def admin_classifiers(
    session: SessionDep, admin: AdminDep, limit: Limit = 20, offset: Offset = 0
):
    total, rows = await page_rows(
        session,
        select(ClassifierVersion).order_by(
            ClassifierVersion.created_at.desc(), ClassifierVersion.id
        ),
        limit,
        offset,
    )
    return Page(
        items=[ClassifierAdminRead.model_validate(row[0]) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
