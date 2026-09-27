from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.api.v1.activity import router as activity_router
from app.api.v1.admin_activity import router as admin_activity_router
from app.api.v1.ai_jobs import router as ai_jobs_router
from app.api.v1.assessment_library import router as assessment_library_router
from app.api.v1.assessment_memory import router as assessment_memory_router
from app.api.v1.auth import router as auth_router
from app.api.v1.authoring import router as authoring_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.catalog_admin import router as catalog_admin_router
from app.api.v1.catalog_editor import router as catalog_editor_router
from app.api.v1.dds_generation import router as dds_generation_router
from app.api.v1.generation import router as generation_router
from app.api.v1.groups import router as groups_router
from app.api.v1.lesson_evaluation import router as lesson_evaluation_router
from app.api.v1.location_services import router as location_services_router
from app.api.v1.service_profiles import router as service_profiles_router
from app.api.v1.student import router as student_router
from app.api.v1.telephony import router as telephony_router
from app.api.v1.telephony_adapter import router as adapter_router
from app.api.v1.telephony_media import router as media_router
from app.api.v1.users import router as users_router
from app.api.v1.views import router as views_router
from app.api.validation import validate_json_numbers

router = APIRouter(dependencies=[Depends(validate_json_numbers)])
router.include_router(adapter_router)
router.include_router(auth_router)

# Add all application routers here so forced password changes cannot be bypassed.
protected_router = APIRouter(dependencies=[Depends(require_user)])
protected_router.include_router(admin_activity_router)
protected_router.include_router(ai_jobs_router)
protected_router.include_router(activity_router)
protected_router.include_router(users_router)
protected_router.include_router(groups_router)
protected_router.include_router(generation_router)
protected_router.include_router(dds_generation_router)
protected_router.include_router(authoring_router)
protected_router.include_router(catalog_router)
protected_router.include_router(service_profiles_router)
protected_router.include_router(catalog_editor_router)
protected_router.include_router(catalog_admin_router)
protected_router.include_router(student_router)
protected_router.include_router(lesson_evaluation_router)
protected_router.include_router(assessment_memory_router)
protected_router.include_router(assessment_library_router)
protected_router.include_router(views_router)
protected_router.include_router(telephony_router)
protected_router.include_router(media_router)
protected_router.include_router(location_services_router)
router.include_router(protected_router)
