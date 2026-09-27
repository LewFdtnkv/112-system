from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import SessionDep, StudentDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.schemas.activity import MessageCreate, MessageSummary, ReferralLessonRead
from app.services import messages as message_service
from app.services.learning_recommendations.referrals import create_lesson

router = APIRouter(tags=["activity"])


@router.post("/messages", status_code=201)
async def message(payload: MessageCreate, session: SessionDep, teacher: TeacherDep):
    return await message_service.send_message(session, teacher.id, payload)


@router.get("/student/messages")
async def messages(
    session: SessionDep,
    student: StudentDep,
    limit: Limit = 20,
    offset: Offset = 0,
    include_advice: bool = True,
    unread_only: bool = False,
):
    return await message_service.list_messages(
        session, student.id, limit, offset, include_advice, unread_only
    )


@router.get("/student/messages/summary", response_model=MessageSummary)
async def unread_summary(session: SessionDep, student: StudentDep):
    return await message_service.unread_summary(session, student.id)


@router.post("/student/messages/{message_id}/read", status_code=204)
async def read_message(message_id: UUID, session: SessionDep, student: StudentDep):
    await message_service.mark_read(session, message_id, student.id)


@router.post("/student/messages/{message_id}/feedback", status_code=204)
async def recommendation_feedback(
    message_id: UUID, session: SessionDep, student: StudentDep, helpful: bool
):
    await message_service.record_feedback(session, message_id, student.id, helpful)


@router.post("/student/learning-referrals/{referral_id}/lesson", response_model=ReferralLessonRead)
async def lesson_from_referral(referral_id: UUID, session: SessionDep, student: StudentDep):
    return await create_lesson(session, referral_id, student.id)
