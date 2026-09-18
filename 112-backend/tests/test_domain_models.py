from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from app.models import (
    AnswerKey,
    Assignment,
    Attempt,
    AttemptEvent,
    ClassifierEntry,
    ClassifierVersion,
    CriterionEvidence,
    CriterionResult,
    Evaluation,
    IncidentCard,
    Lesson,
    ResponseEvent,
    Scenario,
    ScenarioVersion,
    Service,
    ServiceProfile,
    ServiceResponse,
    TrainingCall,
    TrainingContact,
    User,
)
from app.models.enums import (
    CardOrigin,
    CardStatus,
    EvaluationMethod,
    EvaluationStatus,
    EventActor,
    PublicationStatus,
    ResponseStatus,
    TrainingMode,
    TrainingRole,
)


@pytest.fixture
async def domain(db_session):
    async def add(model, **values):
        row = model(**values)
        db_session.add(row)
        await db_session.flush()
        return row

    teacher = await add(
        User, username=f"teacher-{uuid4()}", password_hash="unused", is_teacher=True
    )
    student = await add(User, username=f"student-{uuid4()}", password_hash="unused")
    service = await add(Service, code="training-dds", name="Учебная ДДС")
    other_service = await add(Service, code="training-other", name="Учебная аварийная служба")
    profile = await add(
        ServiceProfile,
        service_id=service.id,
        version=1,
        name=service.name,
        responsibility="Учебная территория",
    )
    classifier = await add(
        ClassifierVersion,
        label="test-v1",
        source_filename="test.xlsx",
        source_storage_key="classifiers/test.xlsx",
        source_sha256="a" * 64,
    )
    entry = await add(
        ClassifierEntry,
        classifier_version_id=classifier.id,
        code="001",
        section="Учебный раздел",
        name="Учебное происшествие",
        source_sheet="Sheet1",
        source_row=2,
        source_data={"headers": ["Код", "Главная служба"]},
    )
    scenario = await add(Scenario, title="Заполнение карточки", created_by_id=teacher.id)
    version = await add(
        ScenarioVersion,
        scenario_id=scenario.id,
        version=1,
        title=scenario.title,
        role=TrainingRole.OPERATOR_112,
        classifier_version_id=classifier.id,
        instructions="Заполните карточку",
        caller_message="Во дворе упало дерево.",
    )
    await add(AnswerKey, scenario_version_id=version.id, expected_card={"description": "Дерево"})
    lesson = await add(Lesson, title="Практика", teacher_id=teacher.id)
    assignment = await add(
        Assignment,
        lesson_id=lesson.id,
        position=1,
        student_id=student.id,
        scenario_version_id=version.id,
        mode=TrainingMode.INTRODUCTION,
    )
    attempts = []
    cards = []
    for number in (1, 2):
        attempt = await add(
            Attempt,
            assignment_id=assignment.id,
            student_id=student.id,
            scenario_version_id=version.id,
            number=number,
            mode=TrainingMode.INTRODUCTION,
            settings_snapshot={"hint_delay_seconds": 60},
        )
        card = await add(
            IncidentCard,
            attempt_id=attempt.id,
            origin=CardOrigin.STUDENT,
            classifier_version_id=classifier.id,
            classifier_entry_id=entry.id,
            created_by_id=student.id,
        )
        attempts.append(attempt)
        cards.append(card)
    response = await add(
        ServiceResponse,
        card_id=cards[0].id,
        attempt_id=attempts[0].id,
        service_id=service.id,
        service_name=service.name,
    )
    contact = await add(
        TrainingContact,
        profile_id=profile.id,
        target_service_id=other_service.id,
        code="duty",
        name="Учебный дежурный",
        endpoint_key="training-duty",
    )
    return SimpleNamespace(**locals())


@pytest.mark.anyio
async def test_same_account_has_separate_training_roles(db_session, domain):
    d = domain
    version = await d.add(
        ScenarioVersion,
        scenario_id=d.scenario.id,
        version=2,
        title="Обработка ДДС",
        role=TrainingRole.DDS,
        classifier_version_id=d.classifier.id,
        service_profile_id=d.profile.id,
        instructions="Примите карточку и позвоните в службу",
    )
    assignment = await d.add(
        Assignment,
        lesson_id=d.lesson.id,
        position=2,
        student_id=d.student.id,
        scenario_version_id=version.id,
        mode=TrainingMode.PRACTICE,
    )
    attempt = await d.add(
        Attempt,
        assignment_id=assignment.id,
        student_id=d.student.id,
        scenario_version_id=version.id,
        number=1,
        mode=TrainingMode.PRACTICE,
        settings_snapshot={},
    )
    roles = list(
        await db_session.scalars(
            select(ScenarioVersion.role)
            .join(Attempt, Attempt.scenario_version_id == ScenarioVersion.id)
            .where(Attempt.student_id == d.student.id)
        )
    )
    assert set(roles) == {TrainingRole.OPERATOR_112, TrainingRole.DDS}
    assert attempt.student_id == d.attempts[0].student_id
    assert not d.student.is_admin and not d.student.is_teacher


@pytest.mark.anyio
async def test_assignment_cannot_replace_student_or_version_after_start(db_session, domain):
    with pytest.raises(IntegrityError, match="fk_attempts_assignment_id_assignments"):
        async with db_session.begin_nested():
            domain.assignment.student_id = domain.teacher.id
            await db_session.flush()


@pytest.mark.parametrize("position", [0, 1])
@pytest.mark.anyio
async def test_assignment_positions_are_positive_and_unique(db_session, domain, position):
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            await domain.add(
                Assignment,
                lesson_id=domain.lesson.id,
                student_id=domain.student.id,
                scenario_version_id=domain.version.id,
                mode=TrainingMode.PRACTICE,
                position=position,
            )


@pytest.mark.anyio
async def test_dds_requires_profile_and_publication_requires_approval(db_session, domain):
    d = domain
    for change, constraint in [
        ({"role": TrainingRole.DDS}, "ck_scenario_versions_dds_profile"),
        ({"status": PublicationStatus.PUBLISHED}, "ck_scenario_versions_publication_approval"),
    ]:
        with pytest.raises(IntegrityError, match=constraint):
            async with db_session.begin_nested():
                await db_session.execute(
                    update(ScenarioVersion)
                    .where(ScenarioVersion.id == d.version.id)
                    .values(**change)
                )


@pytest.mark.anyio
async def test_selected_code_must_belong_to_classifier_version(db_session, domain):
    d = domain
    another = await d.add(
        ClassifierVersion,
        label="test-v2",
        source_filename="second.xlsx",
        source_storage_key="classifiers/second.xlsx",
        source_sha256="b" * 64,
    )
    with pytest.raises(
        IntegrityError, match="fk_incident_cards_classifier_entry_id_classifier_entries"
    ):
        async with db_session.begin_nested():
            d.cards[0].classifier_version_id = another.id
            await db_session.flush()


@pytest.mark.anyio
async def test_responses_cannot_cross_attempts_or_repeat_service(db_session, domain):
    d = domain
    for attempt_id, service, constraint in [
        (d.attempts[1].id, d.other_service, "fk_service_responses_card_id_incident_cards"),
        (d.attempts[0].id, d.service, "uq_service_responses_card_id"),
    ]:
        with pytest.raises(IntegrityError, match=constraint):
            async with db_session.begin_nested():
                await d.add(
                    ServiceResponse,
                    card_id=d.cards[0].id,
                    attempt_id=attempt_id,
                    service_id=service.id,
                    service_name=service.name,
                )


@pytest.mark.anyio
async def test_response_completion_is_independent_and_uses_dispatch_time(db_session, domain):
    d = domain
    later = await d.add(
        ServiceResponse,
        card_id=d.cards[0].id,
        attempt_id=d.attempts[0].id,
        service_id=d.other_service.id,
        service_name=d.other_service.name,
    )
    sent = datetime.now(UTC)
    d.response.sent_at = sent
    d.response.received_at = sent + timedelta(seconds=20)
    d.response.first_decision_at = sent + timedelta(seconds=35)
    d.response.status = ResponseStatus.COMPLETED
    await db_session.flush()
    assert (d.response.first_decision_at - d.response.sent_at).total_seconds() == 35
    assert later.status == ResponseStatus.ADDED
    assert d.cards[0].status == CardStatus.DRAFT


@pytest.mark.anyio
async def test_refusals_require_reason(db_session, domain):
    for status in (ResponseStatus.NOT_ACCEPTED, ResponseStatus.REFUSED):
        with pytest.raises(IntegrityError, match="ck_service_responses_refusal_reason"):
            async with db_session.begin_nested():
                await db_session.execute(
                    update(ServiceResponse)
                    .where(ServiceResponse.id == domain.response.id)
                    .values(status=status, comment="   ")
                )


@pytest.mark.anyio
async def test_unknown_features_remain_sql_null(db_session, domain):
    assert await db_session.scalar(
        text("SELECT features IS NULL FROM incident_cards WHERE id = :id"),
        {"id": domain.cards[0].id},
    )
    domain.cards[0].features = {"has_victims": False, "has_fire": None}
    await db_session.flush()
    await db_session.refresh(domain.cards[0])
    assert domain.cards[0].features == {"has_victims": False, "has_fire": None}


@pytest.mark.anyio
async def test_response_history_and_commands_cannot_cross_attempts(db_session, domain):
    d = domain
    command = uuid4()
    event = await d.add(
        AttemptEvent,
        attempt_id=d.attempts[0].id,
        sequence=1,
        command_id=command,
        kind="response.accepted",
        actor=EventActor.STUDENT,
        actor_id=d.student.id,
    )
    other_event = await d.add(
        AttemptEvent,
        attempt_id=d.attempts[1].id,
        sequence=1,
        kind="crew.message",
        actor=EventActor.SIMULATION,
    )
    with pytest.raises(IntegrityError, match="uq_attempt_events_attempt_id_command_id"):
        async with db_session.begin_nested():
            await d.add(
                AttemptEvent,
                attempt_id=d.attempts[0].id,
                sequence=2,
                command_id=command,
                kind="response.accepted",
                actor=EventActor.STUDENT,
                actor_id=d.student.id,
            )
    with pytest.raises(
        IntegrityError, match="fk_response_events_information_event_id_attempt_events"
    ):
        async with db_session.begin_nested():
            await d.add(
                ResponseEvent,
                response_id=d.response.id,
                attempt_id=d.attempts[0].id,
                attempt_event_id=event.id,
                information_event_id=other_event.id,
                status=ResponseStatus.ACCEPTED,
            )


@pytest.mark.anyio
async def test_training_contact_rejects_external_address(db_session, domain):
    with pytest.raises(IntegrityError, match="ck_training_contacts_local_endpoint"):
        async with db_session.begin_nested():
            domain.contact.endpoint_key = "sip:112@example.org"
            await db_session.flush()


@pytest.mark.anyio
async def test_outgoing_call_has_own_target_and_attempt(db_session, domain):
    d = domain
    values = dict(
        attempt_id=d.attempts[0].id,
        response_id=d.response.id,
        command_id=uuid4(),
        initiated_by_id=d.student.id,
        contact_id=d.contact.id,
        target_service_id=d.other_service.id,
        contact_name=d.contact.name,
        target_service_name=d.other_service.name,
        endpoint_key=d.contact.endpoint_key,
    )
    call = await d.add(TrainingCall, **values)
    assert call.target_service_id != d.response.service_id
    for change, constraint in [
        ({"target_service_id": d.service.id}, "fk_training_calls_contact_id_training_contacts"),
        ({"attempt_id": d.attempts[1].id}, "fk_training_calls_response_id_service_responses"),
    ]:
        with pytest.raises(IntegrityError, match=constraint):
            async with db_session.begin_nested():
                await d.add(TrainingCall, **(values | {"command_id": uuid4()} | change))


@pytest.mark.anyio
async def test_teacher_review_preserves_original_and_evidence_scope(db_session, domain):
    d = domain
    initial = await d.add(
        Evaluation,
        attempt_id=d.attempts[0].id,
        revision=1,
        method=EvaluationMethod.RULES,
        status=EvaluationStatus.COMPLETED,
        score=Decimal("2"),
        max_score=Decimal("5"),
    )
    correction = await d.add(
        Evaluation,
        attempt_id=d.attempts[0].id,
        revision=2,
        method=EvaluationMethod.TEACHER,
        supersedes_id=initial.id,
        reviewer_id=d.teacher.id,
        review_reason="Допустимая формулировка",
        score=Decimal("4"),
        max_score=Decimal("5"),
    )
    item = await d.add(
        CriterionResult,
        evaluation_id=correction.id,
        attempt_id=d.attempts[0].id,
        code="facts",
        criterion_snapshot={"title": "Существенные сведения"},
        score=Decimal("4"),
        max_score=Decimal("5"),
        explanation="Факты переданы",
    )
    event = await d.add(
        AttemptEvent,
        attempt_id=d.attempts[1].id,
        sequence=1,
        kind="card.saved",
        actor=EventActor.STUDENT,
        actor_id=d.student.id,
    )
    with pytest.raises(
        IntegrityError, match="fk_criterion_evidence_attempt_event_id_attempt_events"
    ):
        async with db_session.begin_nested():
            await d.add(
                CriterionEvidence,
                criterion_result_id=item.id,
                attempt_id=d.attempts[0].id,
                attempt_event_id=event.id,
            )
    await db_session.refresh(initial)
    assert initial.score == Decimal("2")
    assert correction.score == Decimal("4")


@pytest.mark.anyio
async def test_history_restricts_deleting_user_and_old_versions(db_session, domain):
    for model, row_id in [(User, domain.student.id), (ScenarioVersion, domain.version.id)]:
        with pytest.raises(IntegrityError):
            async with db_session.begin_nested():
                await db_session.execute(delete(model).where(model.id == row_id))


@pytest.mark.parametrize("entity", ["card", "response"])
@pytest.mark.anyio
async def test_stale_edits_cannot_overwrite_newer_revision(db_session, domain, entity):
    row = domain.cards[0] if entity == "card" else domain.response
    model = type(row)
    field = "description" if entity == "card" else "comment"
    await db_session.execute(
        update(model)
        .where(model.id == row.id)
        .values(revision=row.revision + 1, **{field: "Новое значение"})
        .execution_options(synchronize_session=False)
    )
    with pytest.raises(StaleDataError):
        async with db_session.begin_nested():
            setattr(row, field, "Устаревшая правка")
            await db_session.flush()
    await db_session.refresh(row)
    assert getattr(row, field) == "Новое значение"
