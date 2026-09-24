"""Compose read-only frontend projections."""

from fastapi import APIRouter

from .accounts import router as accounts_router
from .authoring import router as authoring_router
from .catalogs import router as catalogs_router
from .lessons import router as lessons_router

router = APIRouter()
router.include_router(accounts_router)
router.include_router(authoring_router)
router.include_router(lessons_router)
router.include_router(catalogs_router)
