from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import SessionDep, TeacherDep
from app.schemas.assessment_memory import MemoryCreate, MemoryRead
from app.services.assessment_memory import feedback
from app.services.attempt_audit import teacher_attempt

router = APIRouter(
    prefix="/lessons/{lesson_id}/students/{student_id}/attempts/{attempt_id}/assessment-memory",
    tags=["assessment memory"],
)


@router.get("", response_model=list[MemoryRead])
async def listing(
    lesson_id: UUID, student_id: UUID, attempt_id: UUID, session: SessionDep, teacher: TeacherDep
):
    await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    return await feedback.list_feedback(session, attempt_id, teacher.id)


@router.post("", response_model=MemoryRead)
async def publish(
    lesson_id: UUID,
    student_id: UUID,
    attempt_id: UUID,
    payload: MemoryCreate,
    session: SessionDep,
    teacher: TeacherDep,
):
    attempt = await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    return await feedback.save_feedback(session, attempt, teacher.id, payload)


@router.delete("/{example_id}", response_model=MemoryRead)
async def withdraw(
    lesson_id: UUID,
    student_id: UUID,
    attempt_id: UUID,
    example_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
):
    attempt = await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    return await feedback.withdraw(session, attempt, teacher.id, example_id)


@router.get("/retrieval")
async def retrieval(
    lesson_id: UUID, student_id: UUID, attempt_id: UUID, session: SessionDep, teacher: TeacherDep
):
    await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    job = await feedback.job_for(session, attempt_id)
    if not job:
        return {}
    used = (job.output or {}).get("retrieval", {}).get("used_examples", {})
    bundle = job.context.get("retrieval", {})
    return {
        code: [row for row in examples if row["id"] in used.get(code, [])]
        for code, examples in bundle.get("examples", {}).items()
    }
