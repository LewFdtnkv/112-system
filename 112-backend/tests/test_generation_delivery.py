from uuid import UUID

import pytest
from test_card_generation import payload
from test_card_generation import teaching as teaching
from test_student_workflow import exercise as exercise

from app.models import AIJob, Assignment, ScenarioCard
from app.schemas.student import StudentAttemptRead
from app.services.field_evaluation import check_fields
from app.services.generation.narration import CLARIFICATIONS, fallback
from app.services.generation.prose import generation_prompt, source, validate_message
from app.services.learning_scope import field_skill
from scripts.evaluate_generation import sample


def test_call_separates_clarifications_and_hides_system_metadata():
    data = sample("road-collision", parameters={"has_victims": True, "victims_count": 2})
    text = fallback(data).caller_message
    speech, clarification = text.split(CLARIFICATIONS)
    assert "Пострадали два человека" in clarification
    assert "Пострадали два человека" not in speech
    assert "Возраст заявителя" in clarification
    for unwanted in (
        "Время суток",
        "Заявитель: женщина",
        "Номер на экране",
        data["card"]["data"]["caller_details"]["callerId"],
    ):
        assert unwanted not in text
    assert "Время суток" not in generation_prompt(data)
    assert "Пострадали два человека" not in " ".join(source(data)[1])


def test_fall_has_inferred_answers_without_reading_out_the_answer_table():
    data = sample("medical-self-fall")
    text = fallback(data).caller_message
    assert "Я упала" in text
    assert "одному человеку" not in text
    assert data["narrative"]["flags"]["hasVictims"] is True
    assert data["narrative"]["victims_count"] == 1
    assert data["narrative"]["answers"] == {
        "reason": "Травма",
        "conscious": True,
        "breathing": True,
    }


@pytest.mark.parametrize(
    "phrase",
    [
        "Добрый вечер.",
        "Это было утром.",
        "Сейчас ночью темно.",
        "В ходе уточнения выяснено, что я женщина.",
    ],
)
def test_model_cannot_reintroduce_time_or_narrator_in_monologue(phrase):
    data = sample("medical-self-fall")
    with pytest.raises(ValueError):
        validate_message(data, " ".join(source(data)[1]) + " " + phrase)


@pytest.mark.anyio
async def test_generator_stores_aon_separately_and_demographics_in_arm(teaching, db_session):
    rows = await teaching.post(
        "card-generations",
        payload(teaching, message_format="call", gender="female", age=34),
        expected=202,
    )
    job = await db_session.get(AIJob, UUID(rows[0]["id"]))
    data = job.input["card"]["data"]
    assert data["caller_details"]["callerId"] == job.input["facts"]["Учебный телефон"]
    assert data["caller_phone"] is None
    assert data["additional_fields"]["details"]["callerGender"] == "Женский"
    assert data["additional_fields"]["details"]["callerAge"] == "34"


@pytest.mark.anyio
@pytest.mark.parametrize("kind", ["practice", "introduction", "skill_practice"])
async def test_aon_is_present_before_student_input_without_leaking_answers(
    exercise, db_session, kind
):
    e = exercise
    assignment = await db_session.get(Assignment, UUID(e.work["assignments"][0]["id"]))
    source_card = await db_session.get(ScenarioCard, assignment.scenario_card_id)
    snapshot = dict(source_card.snapshot)
    snapshot["data"] = snapshot["data"] | {
        "caller_details": {"callerId": "+7 (000) 000-12-34", "gender": "Женский"},
        "caller_name": "Анна Иванова",
        "caller_phone": None,
        "additional_fields": {"details": {"callerGender": "Женский", "callerAge": "34"}},
    }
    source_card.snapshot = snapshot
    assignment.settings = assignment.settings | {
        "learning_engine": "v1",
        "learning": {
            "kind": kind,
            "target_skills": ["caller", "description"] if kind == "skill_practice" else [],
        },
    }
    await db_session.commit()
    attempt = await e.start()
    data = attempt["card"]["data"]
    assert data["caller_details"] == {"callerId": "+7 (000) 000-12-34"}
    assert not data["caller_name"] and not data["description"]
    assert not data["additional_fields"].get("details", {}).get("callerGender")
    check = check_fields(snapshot, StudentAttemptRead.model_validate(attempt))
    assert not any(f.field == "caller_phone" for f in check.fields)
    assert next(f for f in check.fields if f.field.endswith("callerGender")).status == "missing"
    assert field_skill("additional_fields.details.callerGender") == "caller"
