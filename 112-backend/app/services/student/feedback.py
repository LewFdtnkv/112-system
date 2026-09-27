"""Read-only learner feedback, released after their own lesson is submitted."""

from app.schemas.lesson_evaluation import StudentCardFeedback, StudentLessonFeedback
from app.services.semantic_assessment.results import jobs_for
from app.services.student.access import student_lesson
from app.services.student.journal import lesson_work


async def lesson_feedback(session, lesson_id, student_id):
    lesson = await student_lesson(session, lesson_id, student_id)
    work = await lesson_work(session, lesson, student_id)
    if work.work_status != "submitted":
        return StudentLessonFeedback(submitted=False)
    jobs = {
        job.attempt_id: job
        for job in await jobs_for(session, [a.attempt_id for a in work.assignments if a.attempt_id])
    }
    cards = []
    for assignment in work.assignments:
        job = jobs.get(assignment.attempt_id)
        cards.append(
            StudentCardFeedback(
                assignment_id=assignment.id,
                position=assignment.position,
                title=assignment.title,
                status=job.status
                if job
                else ("not_applicable" if assignment.attempt_id else "not_started"),
                findings=(job.output or {}).get("findings", [])
                if job and job.status == "succeeded"
                else [],
            )
        )
    return StudentLessonFeedback(submitted=True, cards=cards)
