from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import case, func, select
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import AdminDep, CurrentUserDep, SessionDep
from app.core.request_log import LOG_DIRECTORY
from app.models import AuthSession, User, UserPhoto
from app.services.activity import owned_student
from app.services.user_photos import save_photo

router = APIRouter(tags=["administration"])


@router.put("/admin/users/{user_id}/photo", status_code=204)
async def upload_photo(user_id: UUID, request: Request, session: SessionDep, admin: AdminDep):
    await save_photo(session, user_id, admin.id, request.stream())


@router.get("/users/{user_id}/photo")
async def photo(user_id: UUID, session: SessionDep, user: CurrentUserDep):
    if user.id != user_id and not user.is_admin:
        if not user.is_teacher:
            raise HTTPException(404, "Photo not found")
        await owned_student(session, user_id, user.id)
    row = await session.get(UserPhoto, user_id)
    if row is None:
        return Response(status_code=204)
    return Response(row.content, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/admin/statistics")
async def statistics(session: SessionDep, admin: AdminDep):
    role = case(
        (User.is_admin.is_(True), "admin"), (User.is_teacher.is_(True), "teacher"), else_="student"
    )
    users = (
        (
            await session.execute(
                select(
                    role.label("role"),
                    func.count().label("registered"),
                    func.count().filter(User.is_active).label("enabled"),
                ).group_by(role)
            )
        )
        .mappings()
        .all()
    )
    sessions = dict(
        (
            await session.execute(
                select(role, func.count())
                .select_from(User)
                .join(AuthSession, AuthSession.user_id == User.id)
                .where(
                    AuthSession.revoked_at.is_(None),
                    AuthSession.expires_at > func.now(),
                    User.is_active,
                )
                .group_by(role)
            )
        ).all()
    )
    return [{**r, "sessions": sessions.get(r["role"], 0)} for r in users]


@router.get("/admin/system-logs/export")
async def system_logs(admin: AdminDep):
    def read():
        return b"\n".join(
            path.read_bytes()
            for path in [
                *(LOG_DIRECTORY / f"requests.log.{i}" for i in (3, 2, 1)),
                LOG_DIRECTORY / "requests.log",
            ]
            if path.exists()
        )

    content = await run_in_threadpool(read)
    return Response(
        content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="system-requests.txt"',
            "Cache-Control": "no-store",
        },
    )
