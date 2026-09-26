from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models import Assignment, Attempt, AttemptEvent, ScenarioCard
from app.schemas.learning import HintRead, LearningHint
from app.services.audit import append_event
from app.services.dds_delivery import execution_for
from app.services.interface_guide import GUIDE_VERSION, guide_correction, guide_text, next_step
from app.services.learning_hints.dds import dds_task
from app.services.learning_hints.operator import operator_task
from app.services.learning_hints.policy import AUTO_HINT_DELAY_SECONDS, LEVELS
from app.services.student.access import owned_attempt
from app.services.student.reads import attempt_read


async def issue_hint(session, attempt_id, student_id, command):
    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    read = await attempt_read(session, attempt)
    revision = read.dds["revision"] if read.dds else read.card.revision
    policy = read.learning.assistance
    if attempt.status != "in_progress" or lesson.status != "active":
        return HintRead(status="complete", revision=revision)
    if (
        read.learning.kind == "assessment"
        or policy.max_level == "none"
        or not attempt.settings_snapshot.get("learning_engine")
    ):
        return HintRead(status="disabled", revision=revision)
    if LEVELS.index(command.level) > LEVELS.index(policy.max_level):
        raise HTTPException(403, "Эта глубина подсказки не разрешена преподавателем.")
    if command.trigger == "request" and not policy.on_request:
        raise HTTPException(403, "Запрос подсказки отключён преподавателем.")
    if command.trigger == "automatic" and command.level != "goal":
        raise HTTPException(422, "Автоматически можно только напомнить цель.")
    if command.trigger == "guided" and (
        read.learning.kind != "introduction" or command.level != "solution"
    ):
        raise HTTPException(422, "Guided steps require an introduction lesson and solution level")
    if command.confirm_hint_id and command.trigger != "guided":
        raise HTTPException(422, "Подтверждение шага доступно только в сопровождении.")
    if command.check_task and command.trigger != "guided":
        raise HTTPException(422, "Проверка ответа доступна только в сопровождении.")
    request = command.model_dump(mode="json", exclude={"request_id"}, exclude_none=True)
    existing = await session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.attempt_id == attempt.id, AttemptEvent.command_id == command.request_id
        )
    )
    if existing:
        if existing.kind != "learning.hint_issued" or existing.payload["request"] != request:
            raise HTTPException(409, "Request ID was already used with different parameters")
        return (
            HintRead.model_validate(existing.payload["response"])
            if existing.payload["response"]["revision"] == revision
            else HintRead(status="waiting", revision=revision)
        )
    if command.trigger == "automatic":
        if attempt.settings_snapshot.get("delivery") == "dds-stream-v1":
            assignment = await session.get(Assignment, attempt.assignment_id)
            execution = await execution_for(session, assignment.lesson_id, student_id)
            if not execution or execution.active_attempt_id != attempt.id:
                return HintRead(status="waiting", revision=revision)
            recent = await session.scalar(
                select(AttemptEvent.occurred_at)
                .join(Attempt, Attempt.id == AttemptEvent.attempt_id)
                .join(Assignment, Assignment.id == Attempt.assignment_id)
                .where(
                    Assignment.lesson_id == assignment.lesson_id,
                    Assignment.student_id == student_id,
                    AttemptEvent.kind.in_(
                        ["dds.card_opened", "dds.crew_changed", "call.requested"]
                    ),
                )
                .order_by(AttemptEvent.occurred_at.desc())
                .limit(1)
            )
            if recent and (datetime.now(UTC) - recent).total_seconds() < AUTO_HINT_DELAY_SECONDS:
                return HintRead(status="waiting", revision=revision)
        last = await session.scalar(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == attempt.id,
                AttemptEvent.kind.in_(
                    [
                        "attempt.started",
                        "card.draft_saved",
                        "card.services_changed",
                        "dds.crew_changed",
                        "learning.hint_issued",
                    ]
                ),
            )
            .order_by(AttemptEvent.sequence.desc())
            .limit(1)
        )
        if (
            last
            and (datetime.now(UTC) - last.occurred_at).total_seconds() < AUTO_HINT_DELAY_SECONDS
        ):
            return HintRead(status="waiting", revision=revision)
    assignment = await session.get(Assignment, attempt.assignment_id)
    source = await session.get(ScenarioCard, assignment.scenario_card_id)
    if not read.dds:
        from app.models import ClassifierEntry

        entry = (
            await session.get(ClassifierEntry, source.snapshot["classifier_entry_id"])
            if source.snapshot.get("classifier_entry_id")
            else None
        )
        source_data = source.snapshot | {
            "classifier_entry": {
                "name": (entry.display_name or entry.name) if entry else "Не установлен"
            }
        }
    if read.dds:
        names = {c["code"]: c["name"] for c in read.dds["profile"]["crews"]}
        goals = [
            {**g, "name": names[g["crew_code"]]}
            for g in attempt.settings_snapshot["dds_policy"]["required_crews"]
        ]
    advance, continue_allowed = "action", False
    if read.learning.kind == "introduction":
        step, advance, continue_allowed = await next_step(
            session,
            attempt,
            read,
            None if read.dds else source_data,
            goals if read.dds else None,
            command.confirm_hint_id,
        )
    else:
        step = dds_task(read, goals) if read.dds else operator_task(source_data, read)
    task, target, goal, explanation, solution = step
    previous = await session.scalar(
        select(AttemptEvent)
        .where(
            AttemptEvent.attempt_id == attempt.id,
            AttemptEvent.kind == "learning.hint_issued",
            AttemptEvent.payload["task"].astext == task,
            AttemptEvent.payload["level"].astext == command.level,
            AttemptEvent.payload["revision"].as_integer() == revision,
            *(
                [
                    AttemptEvent.payload["guide_version"].as_integer() == GUIDE_VERSION,
                    AttemptEvent.payload["request"]["check_task"].astext.is_not_distinct_from(
                        command.check_task
                    ),
                ]
                if read.learning.kind == "introduction"
                else []
            ),
        )
        .order_by(AttemptEvent.sequence.desc())
        .limit(1)
    )
    if previous:
        await session.commit()
        return (
            HintRead(status="waiting", revision=revision)
            if command.trigger == "automatic"
            else HintRead.model_validate(previous.payload["response"])
        )
    if read.learning.kind == "introduction":
        solution = guide_text(task, target, explanation)
    hint = LearningHint(
        id=str(command.request_id),
        task=task,
        level=command.level,
        text=solution
        if read.learning.kind == "introduction"
        else {"goal": goal, "explanation": explanation, "solution": solution}[command.level],
        target=None if command.level == "goal" else target,
        presentation="text" if command.level == "goal" else "highlight",
        advance=advance,
        continue_allowed=continue_allowed,
        correction=guide_correction(
            None if read.dds else source_data, read, step, command.check_task
        )
        if read.learning.kind == "introduction"
        else None,
    )
    result = HintRead(status="ready", revision=revision, hint=hint)
    await append_event(
        session,
        attempt.id,
        "learning.hint_issued",
        {
            "request": request,
            "response": result.model_dump(mode="json"),
            "task": task,
            "level": command.level,
            "revision": revision,
            "trigger": command.trigger,
            "guide_version": GUIDE_VERSION if read.learning.kind == "introduction" else None,
        },
        command_id=command.request_id,
    )
    await session.commit()
    return result
