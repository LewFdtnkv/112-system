"""Sample learner actions; assessments are produced by the normal rules and AI workers."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.models import (
    Assignment,
    Attempt,
    Lesson,
    LessonEvaluation,
    ScenarioCard,
)
from app.schemas.activity import ProctoringBatch, ProctoringObservation
from app.schemas.learning import HintRequest
from app.schemas.lesson_evaluation import LessonGradeCreate
from app.schemas.student import CardSubmit, DraftSave
from app.services.learning_hints.service import issue_hint
from app.services.proctoring import observe
from app.services.student.attempts import start_attempt
from app.services.student.commands import save_card, submit_card
from scripts.seed_dds import complete_attempt


def command_key(attempt_id, name):
    return uuid5(NAMESPACE_URL, f"full-demo/{attempt_id}/{name}")


async def complete_lesson(gateway, state, lesson_id, student_id, role, kind, variant):
    session = gateway.session
    student_id = UUID(student_id)
    assignments = list(
        await session.scalars(
            select(Assignment)
            .where(Assignment.lesson_id == UUID(lesson_id), Assignment.student_id == student_id)
            .order_by(Assignment.position)
        )
    )
    completed = []
    for assignment in assignments:
        existing = await session.scalar(
            select(Attempt).where(Attempt.assignment_id == assignment.id)
        )
        if existing and existing.status == "completed":
            attempt_id = existing.id
        else:
            read, _ = await start_attempt(session, assignment.id, student_id)
            attempt_id = read.id
            if variant == 2 and kind != "assessment":
                await issue_hint(
                    session,
                    attempt_id,
                    student_id,
                    HintRequest(request_id=command_key(attempt_id, "hint"), level="solution"),
                )
            # Observations are visibly untrusted browser evidence, never a score penalty.
            now = datetime.now(UTC)
            await observe(
                session,
                attempt_id,
                student_id,
                ProctoringBatch(
                    events=[
                        ProctoringObservation(
                            command_id=command_key(attempt_id, event),
                            kind=event,
                            client_occurred_at=now + timedelta(milliseconds=i),
                        )
                        for i, event in enumerate(
                            ("tab.hidden", "window.blur", "tab.visible", "window.focus")
                        )
                    ]
                ),
            )
            if role == "dds":
                dds = gateway.dds()
                dds.student_id = student_id
                await complete_attempt(
                    dds,
                    read.model_dump(mode="json"),
                    comment_override="123" if variant == 2 else None,
                )
            else:
                source = await session.get(ScenarioCard, assignment.scenario_card_id)
                data = deepcopy(source.snapshot["data"])
                if variant == 2:
                    data["address_details"]["house"] = ""
                    data["address_text"] = "Москва, Учебная улица"
                saved = await save_card(
                    session,
                    attempt_id,
                    student_id,
                    DraftSave(
                        revision=read.card.revision,
                        classifier_entry_id=source.snapshot["classifier_entry_id"],
                        data=data,
                    ),
                )
                await submit_card(
                    session, attempt_id, student_id, CardSubmit(revision=saved.card.revision)
                )
        completed.append(str(attempt_id))
    return completed


async def paused_lesson(session, state, lesson_id, student_id):
    from app.services.lesson_presence import begin, presence

    marker = "full-demo-paused"
    if marker in state.data["ids"]:
        return
    lesson = await session.get(Lesson, UUID(lesson_id))
    student_id = UUID(student_id)
    assignment = await session.scalar(
        select(Assignment).where(
            Assignment.lesson_id == lesson.id, Assignment.student_id == student_id
        )
    )
    read, _ = await start_attempt(session, assignment.id, student_id)
    execution = await begin(session, lesson, student_id)
    await presence(session, lesson, student_id, execution.session_id, leaving=True)
    state.remember(marker, str(read.id))


async def teacher_review(session, state, teacher_id, lesson_id, student_id):
    from app.services.lesson_evaluation import grade_lesson

    request_id = command_key(lesson_id, f"teacher-review/{student_id}")
    if await session.scalar(
        select(LessonEvaluation.id).where(LessonEvaluation.request_id == request_id)
    ):
        return
    latest = await session.scalar(
        select(LessonEvaluation)
        .where(
            LessonEvaluation.lesson_id == UUID(lesson_id),
            LessonEvaluation.student_id == UUID(student_id),
        )
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    await grade_lesson(
        session,
        UUID(lesson_id),
        UUID(student_id),
        teacher_id,
        LessonGradeCreate(
            request_id=request_id,
            expected_revision=latest.revision if latest else 0,
            score=75,
            max_score=100,
            comment="Демонстрационный пересмотр: тип определён верно, "
            "но не перенесён номер дома. Повторите упражнение на адрес.",
        ),
    )


async def expired_lesson(session, lesson_id, student_id):
    import asyncio

    from app.services.deadlines import enforce_deadlines

    lesson = await session.get(Lesson, UUID(lesson_id))
    if lesson.status == "finished":
        return
    assignment = await session.scalar(
        select(Assignment).where(
            Assignment.lesson_id == lesson.id, Assignment.student_id == UUID(student_id)
        )
    )
    await start_attempt(session, assignment.id, UUID(student_id))
    # Let the real one-second personal deadline expire; do not falsify audit timestamps.
    await asyncio.sleep(1.05)
    await enforce_deadlines(session, lesson)
