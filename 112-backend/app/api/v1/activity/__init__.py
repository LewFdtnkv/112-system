"""Compose activity routes; endpoint modules do not import one another."""

from fastapi import APIRouter

from .groups import router as groups_router
from .messages import router as messages_router
from .proctoring import router as proctoring_router
from .reports import router as reports_router
from .students import router as students_router
from .user_audit import router as user_audit_router

router = APIRouter()
router.include_router(groups_router)
router.include_router(messages_router)
router.include_router(students_router)
router.include_router(reports_router)
router.include_router(user_audit_router)
router.include_router(proctoring_router)
