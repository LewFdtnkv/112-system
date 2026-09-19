from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import AdminDep, CurrentUserDep, SessionDep, StaffDep
from app.models import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.users import create_user, update_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=201)
async def add_user(payload: UserCreate, session: SessionDep, admin: AdminDep) -> User:
    return await create_user(session, payload)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUserDep) -> User:
    return user


@router.get("", response_model=list[UserRead])
async def list_users(
    session: SessionDep,
    staff: StaffDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
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
