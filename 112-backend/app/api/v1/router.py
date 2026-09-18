from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router

router = APIRouter()
router.include_router(auth_router)

# Add all application routers here so forced password changes cannot be bypassed.
protected_router = APIRouter(dependencies=[Depends(require_user)])
protected_router.include_router(users_router)
router.include_router(protected_router)
