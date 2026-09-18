from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import User
from app.services.auth import Identity, authenticate, unauthorized

SessionDep = Annotated[AsyncSession, Depends(get_session)]

bearer = HTTPBearer(auto_error=False)


async def get_identity(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Identity:
    if credentials is None:
        raise unauthorized()
    return await authenticate(session, credentials.credentials)


IdentityDep = Annotated[Identity, Depends(get_identity)]


async def require_user(identity: IdentityDep) -> User:
    if identity.user.must_change_password:
        raise HTTPException(status_code=403, detail="password_change_required")
    return identity.user


CurrentUserDep = Annotated[User, Depends(require_user)]


async def require_staff(user: CurrentUserDep) -> User:
    if not (user.is_admin or user.is_teacher):
        raise HTTPException(status_code=403, detail="Teacher or administrator access required")
    return user


StaffDep = Annotated[User, Depends(require_staff)]


async def require_admin(user: CurrentUserDep) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


async def require_teacher(user: CurrentUserDep) -> User:
    if not user.is_teacher:
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


AdminDep = Annotated[User, Depends(require_admin)]
TeacherDep = Annotated[User, Depends(require_teacher)]
