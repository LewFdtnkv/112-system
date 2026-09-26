from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.api.dependencies import AdminDep, CurrentUserDep, SessionDep, StaffDep
from app.api.pagination import Limit, Offset
from app.models import User
from app.schemas.user import ProfileUpdate, UserCreate, UserPasswordReset, UserRead, UserUpdate
from app.services.user_photos import save_photo
from app.services.users import create_user, reset_password, update_profile, update_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=201)
async def add_user(payload: UserCreate, session: SessionDep, admin: AdminDep) -> User:
    return await create_user(session, payload, admin.id)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUserDep) -> User:
    return user


@router.patch("/me", response_model=UserRead)
async def edit_profile(payload: ProfileUpdate, session: SessionDep, user: CurrentUserDep) -> User:
    return await update_profile(session, user.id, payload)


@router.put("/me/photo", status_code=204)
async def upload_own_photo(request: Request, session: SessionDep, user: CurrentUserDep):
    await save_photo(session, user.id, user.id, request.stream())


@router.get("", response_model=list[UserRead])
async def list_users(
    session: SessionDep,
    staff: StaffDep,
    limit: Limit = 20,
    offset: Offset = 0,
) -> list[User]:
    return list(
        await session.scalars(
            select(User).order_by(User.created_at, User.id).limit(limit).offset(offset)
        )
    )


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: UUID, session: SessionDep, staff: StaffDep) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def edit_user(
    user_id: UUID, payload: UserUpdate, session: SessionDep, admin: AdminDep
) -> User:
    return await update_user(session, user_id, admin.id, payload)


@router.post("/{user_id}/reset-password", response_model=UserRead)
async def reset_user_password(
    user_id: UUID, payload: UserPasswordReset, session: SessionDep, admin: AdminDep
) -> User:
    return await reset_password(session, user_id, admin.id, payload)
