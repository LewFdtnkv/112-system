from fastapi import APIRouter, Response

from app.api.dependencies import IdentityDep, SessionDep
from app.schemas.auth import ChangePasswordRequest, LoginRequest, RefreshRequest, TokenPair
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])


def prevent_token_caching(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, session: SessionDep, response: Response) -> TokenPair:
    prevent_token_caching(response)
    return await auth.login(session, payload.username, payload.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, session: SessionDep, response: Response) -> TokenPair:
    prevent_token_caching(response)
    return await auth.refresh(session, payload.refresh_token)


@router.post("/change-password", response_model=TokenPair)
async def change_password(
    payload: ChangePasswordRequest,
    session: SessionDep,
    identity: IdentityDep,
    response: Response,
) -> TokenPair:
    prevent_token_caching(response)
    return await auth.change_password(
        session, identity, payload.current_password, payload.new_password
    )


@router.post("/logout", status_code=204)
async def logout(session: SessionDep, identity: IdentityDep) -> None:
    await auth.logout(session, identity)
