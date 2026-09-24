"""SQL pagination shared by read projections."""

from sqlalchemy import func, select


async def page_rows(session, query, limit, offset):
    total = await session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    return total, (await session.execute(query.limit(limit).offset(offset))).all()
