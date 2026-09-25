import random
from types import SimpleNamespace
from uuid import UUID

import pytest
from test_card_generation import payload
from test_card_generation import teaching as teaching
from test_generation_situations import entries
from test_student_workflow import exercise as exercise

from app.models import AIJob, CardTemplate
from app.schemas.generation import GenerationParameters
from app.schemas.student import StudentAttemptRead
from app.services.catalog_rules import feature_definitions, validate_answers
from app.services.field_evaluation import check_fields
from app.services.generation.evidence import extra_evidence
from app.services.generation.library import for_entry
from app.services.generation.llm import compose
from app.services.generation.planner import build
from app.services.generation.presentation import prepare_message, resolve_address, resolve_caller
from app.services.generation_worker import claim, finish

pytestmark = pytest.mark.anyio


def prepared(entry, template, p, seed=2):
    rng = random.Random(seed)
    plan = build(entry, template, p, rng)
    definitions = feature_definitions(entry)
    prepare_message(plan, p, definitions, rng)
    validate_answers(definitions, plan["answers"])
    plan.update(mode="template", default_wording={"wording": 0, "opening": 0, "order": 0})
    plan["extra_evidence"] = extra_evidence(definitions, plan["answers"], plan)
    address, text = resolve_address(p, plan, rng)
    name, gender, age, phone = resolve_caller(p, plan, rng)
    return {
        "narrative": plan,
        "facts": {
            "Адрес": text,
            "ФИО заявителя": name,
            "Пол": gender,
            "Возраст": age,
            "Время суток": "День",
            "Подробность сообщения": "Краткое сообщение",
        },
        "card": {
            "data": {
                "caller_name": name,
                "caller_phone": phone,
                "address_details": address,
                "address_text": text,
            }
        },
    }


def test_all_situations_support_sms_and_landmarks_without_invented_identity():
    for entry in entries():
        for template in for_entry(entry):
            for channel in ("call", "sms"):
                p = GenerationParameters(
                    message_format=channel,
                    caller_information="anonymous",
                    address_format=None if template.service_call else "descriptive",
                )
                data = prepared(entry, template, p)
                text, metadata = compose(SimpleNamespace(input=data))
                assert metadata["source"] == "template"
                assert "Меня зовут" not in text.caller_message
                assert "Возраст" not in text.caller_message
                assert "соединение" not in text.caller_message.lower()
                address = data["card"]["data"]["address_details"]
                if not template.service_call:
                    assert address["description"] in text.caller_message
                    assert "house" not in address
                if channel == "sms":
                    assert text.caller_message.startswith("СМС:")
                    assert "Сведения, доступные" not in text.caller_message
                    assert "АОН" not in text.caller_message


async def test_unknown_sms_information_is_not_a_scored_reference(exercise):
    entry = next(e for e in entries() if e.name == "101")
    template = next(t for t in for_entry(entry) if t.id == "fire-rubbish")
    data = prepared(
        entry,
        template,
        GenerationParameters(
            message_format="sms", caller_information="anonymous", address_format="descriptive"
        ),
    )
    plan = data["narrative"]
    assert plan["flags"] == {} and plan["victims_count"] is None
    assert "medical_help" not in plan["answers"]
    text, _ = compose(SimpleNamespace(input=data))
    assert "Никто не пострадал" not in text.caller_message
    actual = StudentAttemptRead.model_validate(await exercise.complete())
    reference = data["card"]["data"] | {
        "description": text.description,
        "additional_fields": {"details": plan["flags"]},
        "features": {"ekp": plan["answers"]},
    }
    check = check_fields({"data": reference}, actual)
    assert not any(
        f.field.startswith("caller")
        or f.field.endswith(".house")
        or f.field.endswith(".hasVictims")
        for f in check.fields
    )
    assert any(f.field == "address_details.description" and not f.scored for f in check.fields)


async def test_sms_settings_survive_queue_and_publication(teaching, db_session):
    t = teaching
    jobs = await t.post(
        "card-generations",
        payload(
            t,
            message_format="sms",
            caller_information="anonymous",
            address_format="descriptive",
            address_description="за остановкой, рядом с зелёным ограждением",
            mode="template",
        )
        | {"count": 1},
        expected=202,
    )
    job = await db_session.get(AIJob, UUID(jobs[0]["id"]))
    assert job.input["card"]["data"]["caller_name"] is None
    current = await claim(db_session)
    text, metadata = compose(current)
    assert await finish(db_session, current.id, current.worker_id, text, metadata)
    card = await db_session.get(CardTemplate, current.card_template_id)
    assert card.data["additional_fields"]["messageChannel"] == "sms"
    assert card.data["address_details"]["description"] in card.caller_message
    assert card.data["caller_phone"] is None
    for parameter in ("no_contact", "call_dropped"):
        await t.post("card-generations", payload(t, **{parameter: True}), expected=422)


@pytest.mark.parametrize(
    "params",
    [
        {"caller_information": "anonymous", "caller_name": "Анна"},
        {"caller_information": "name_only", "age": 25},
        {"address_format": "descriptive", "house": "7"},
        {"address_format": "structured", "address_description": "За мостом"},
    ],
)
def test_conflicting_presentation_settings_are_rejected(params):
    with pytest.raises(ValueError):
        GenerationParameters(**params)


def test_unconscious_patient_is_not_described_as_giving_consent():
    entry = next(e for e in entries() if e.name == "103")
    template = next(t for t in for_entry(entry) if t.id == "medical-faint")
    data = prepared(
        entry, template, GenerationParameters(message_format="call", refused_ambulance=False)
    )
    text, _ = compose(SimpleNamespace(input=data))
    assert "потерял сознание" in text.caller_message
    assert "согласны" not in text.caller_message
    assert "От скорой никто не отказывался" in text.caller_message
