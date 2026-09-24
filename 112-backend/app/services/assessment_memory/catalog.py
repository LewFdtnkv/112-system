"""A teacher can exclude shared examples without changing another teacher's grading."""

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from app.models import AssessmentExample as Example
from app.models import AssessmentMemoryPreference as Preference
from app.schemas.assessment_memory import MemoryLibraryItem, MemoryLibraryPage


def item(row, disabled=False, removed=False):
    return MemoryLibraryItem(
        id=row.id,
        criterion_code=row.criterion_code,
        verdict=row.verdict,
        reason=row.reason,
        active=row.active,
        created_at=row.created_at,
        embedded_at=row.embedded_at,
        kind=row.kind,
        role=row.role,
        condition=row.situation,
        answer=row.answer,
        source="teacher" if row.created_by_id else "shared",
        enabled=row.active and not disabled and not removed,
        removed=removed,
    )


async def listing(
    session, teacher_id, q="", kind=None, state="all", include_removed=False, limit=20, offset=0
):
    query = (
        select(Example, Preference.disabled, Preference.removed)
        .outerjoin(
            Preference,
            and_(Preference.example_id == Example.id, Preference.teacher_id == teacher_id),
        )
        .where(or_(Example.created_by_id.is_(None), Example.created_by_id == teacher_id))
    )
    if not include_removed:
        query = query.where(func.coalesce(Preference.removed, False).is_(False))
    if q.strip():
        query = query.where(Example.search_text.icontains(q.strip(), autoescape=True))
    if kind:
        query = query.where(Example.kind == kind)
    enabled = and_(
        Example.active.is_(True),
        func.coalesce(Preference.disabled, False).is_(False),
        func.coalesce(Preference.removed, False).is_(False),
    )
    if state == "enabled":
        query = query.where(enabled)
    elif state == "disabled":
        query = query.where(~enabled)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await session.execute(
            query.order_by(Example.created_at.desc(), Example.id).limit(limit).offset(offset)
        )
    ).all()
    return MemoryLibraryPage(
        items=[item(r, d, m or False) for r, d, m in rows], total=total, limit=limit, offset=offset
    )


async def update(session, teacher_id, example_id, *, enabled=False, removed=False):
    row = await session.scalar(
        select(Example)
        .where(
            Example.id == example_id,
            or_(Example.created_by_id.is_(None), Example.created_by_id == teacher_id),
        )
        .with_for_update()
    )
    if not row:
        raise HTTPException(404, "Разбор не найден")
    if enabled and not row.active:
        raise HTTPException(
            409, "Этот разбор отозван или заменён. Сохраните новый разбор в результатах работы."
        )
    await session.execute(
        insert(Preference)
        .values(
            teacher_id=teacher_id,
            example_id=example_id,
            disabled=not enabled,
            removed=removed,
        )
        .on_conflict_do_update(
            index_elements=[Preference.teacher_id, Preference.example_id],
            set_={"disabled": not enabled, "removed": removed},
        )
    )
    await session.commit()
    return item(row, not enabled, removed)
