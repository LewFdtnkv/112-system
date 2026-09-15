from fastapi import APIRouter

from app.api.v1.workstations import router as workstations_router

router = APIRouter()
router.include_router(workstations_router)
