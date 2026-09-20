from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy import case, func, select
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import AdminDep, CurrentUserDep, SessionDep
from app.core.request_log import LOG_DIRECTORY
from app.models import AuthSession, User, UserActivity, UserPhoto
from app.services.activity import owned_student

router = APIRouter(tags=["administration"])


def normalize_photo(content):
    try:
        with Image.open(BytesIO(content)) as image:
            if image.format not in ("JPEG", "PNG") or image.width * image.height > 16_000_000:
                raise ValueError()
            image.load()
            image.thumbnail((512, 512))
            output = BytesIO()
            image.convert("RGB").save(output, format="JPEG", quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Choose a valid PNG or JPEG photo up to 16 megapixels") from None


@router.put("/admin/users/{user_id}/photo", status_code=204)
async def upload_photo(user_id: UUID, request: Request, session: SessionDep, admin: AdminDep):
    if await session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 2_000_000:
            raise HTTPException(413, "Photo must be smaller than 2 MB")
    normalized = await run_in_threadpool(normalize_photo, bytes(content))
    from sqlalchemy.dialects.postgresql import insert

    await session.execute(
        insert(UserPhoto)
        .values(user_id=user_id, content=normalized)
        .on_conflict_do_update(index_elements=["user_id"], set_={"content": normalized})
    )
    session.add(UserActivity(user_id=user_id, actor_id=admin.id, kind="account.photo_changed"))
    await session.commit()


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
