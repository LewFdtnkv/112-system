import random
from uuid import UUID

import pytest
from faker.generator import random as faker_random
from faker.providers.person.ru_RU import Provider as RussianPerson
from fastapi import HTTPException
from test_card_generation import payload
from test_card_generation import teaching as teaching

from app.models import AIJob, CardTemplate
from app.schemas.generation import GenerationParameters
from app.services.generation.catalogs import CALLER_NAME_SOURCE, address_catalog, random_caller
from app.services.generation.llm import compose
from app.services.generation.presentation import resolve_address, resolve_caller
from app.services.generation_worker import claim, finish

pytestmark = pytest.mark.anyio


def plan(**kwargs):
    return {
        "caller_information": "full",
        "message_format": "call",
        "service_call": False,
        "object": "жилой дом",
        **kwargs,
    }


def test_random_names_use_independent_gendered_dictionaries_with_optional_patronymic():
    for gender in ("male", "female"):
        words = {
            key: getattr(RussianPerson, f"{prefix}_names_{gender}")
            for key, prefix in (
                ("first_name", "first"),
                ("last_name", "last"),
                ("patronymic", "middle"),
            )
        }
        chosen = []
        for seed in range(1000):
            name, actual_gender = random_caller(random.Random(seed), gender)
            parts = name.split()
            assert actual_gender == gender
            assert parts[0] in words["last_name"] and parts[1] in words["first_name"]
            assert len(parts) == 2 or len(parts) == 3 and parts[2] in words["patronymic"]
            chosen.append(name)
        assert len(set(chosen)) > 950
        assert 740 < sum(len(name.split()) == 3 for name in chosen) < 860
        # The same given name can have different surnames, not a fixed person record.
        first = chosen[0].split()[1]
        assert len({n.split()[0] for n in chosen if n.split()[1] == first}) > 1
    assert {random_caller(random.Random(seed))[1] for seed in range(20)} == {"male", "female"}


def test_faker_uses_per_card_randomness_without_changing_shared_state():
    global_before = faker_random.getstate()
    left, right = random.Random(112), random.Random(112)
    for _ in range(10):
        expected = random_caller(left)
        random_caller(random.Random(999))
        assert random_caller(right) == expected
    assert faker_random.getstate() == global_before


def test_manual_names_are_preserved_and_short_or_anonymous_messages_stay_short():
    for name in ("Иванов Александр", "Иванов Александр Сергеевич"):
        p = GenerationParameters(caller_name=name)
        assert resolve_caller(p, plan(), random.Random(1))[:2] == (name, None)
        assert resolve_caller(p, plan(caller_information="name_only"), random.Random(1))[:3] == (
            name,
            None,
            None,
        )
    p = GenerationParameters(caller_name="Анна", gender="female")
    assert resolve_caller(p, plan(), random.Random(1))[:2] == ("Анна", "Женский")
    for gender, label in (("male", "Мужской"), ("female", "Женский")):
        p = GenerationParameters(gender=gender)
        full = resolve_caller(p, plan(), random.Random(1))
        assert full[1] == label
        short = resolve_caller(p, plan(caller_information="name_only"), random.Random(1))
        assert short[0] in getattr(RussianPerson, f"first_names_{gender}")
        assert short[1:3] == (None, None)
    assert resolve_caller(
        GenerationParameters(),
        plan(caller_information="anonymous", message_format="sms"),
        random.Random(1),
    ) == (None, None, None, None)


def test_random_addresses_never_mix_streets_and_houses():
    records = address_catalog()["addresses"]
    pairs = {(a["locality"], a["street"], a["house"]) for a in records}
    assert len(records) == len(pairs) == 108
    assert len({a["street"] for a in records}) == 30
    for seed in range(100):
        state = plan()
        address, text = resolve_address(
            GenerationParameters(address_format="structured"), state, random.Random(seed)
        )
        assert tuple(address[k] for k in ("locality", "street", "house")) in pairs
        assert address["street"] in text and address["house"] in text
        assert state["address_record_id"] in {a["id"] for a in records}
    street = records[0]["street"]
    for seed in range(20):
        address, _ = resolve_address(
            GenerationParameters(street=street, address_format="structured"),
            plan(),
            random.Random(seed),
        )
        assert ("Москва", street, address["house"]) in pairs


def test_custom_addresses_require_complete_facts_and_landmarks_do_not_reveal_a_house():
    with pytest.raises(HTTPException, match="справочнике"):
        resolve_address(GenerationParameters(street="Вымышленная улица"), plan(), random.Random(1))
    state = plan()
    address, text = resolve_address(
        GenerationParameters(locality="Троицк", street="Учебная улица", house="7"),
        state,
        random.Random(1),
    )
    assert address["locality"] == "Троицк" and address["house"] == "7"
    assert state["address_source"] == "teacher" and "Троицк, Учебная улица, д. 7" == text
    address, _ = resolve_address(
        GenerationParameters(address_format="descriptive"), plan(), random.Random(1)
    )
    assert "house" not in address and address["description"]
    assert resolve_address(GenerationParameters(), plan(service_call=True), random.Random(1)) == (
        {},
        "",
    )


async def test_random_name_and_fixed_address_survive_enqueue_and_worker(teaching, db_session):
    t = teaching
    a = address_catalog()["addresses"][0]
    request = payload(
        t,
        mode="template",
        gender="female",
        caller_information="full",
        address_format="structured",
        street=a["street"],
        house=a["house"],
    ) | {"count": 1}
    jobs = await t.post("card-generations", request, expected=202)
    assert jobs[0]["facts"]["Пол"] == "Женский"
    name = jobs[0]["facts"]["ФИО заявителя"]
    assert await t.post("card-generations", request, expected=202) == jobs
    job = await db_session.get(AIJob, UUID(jobs[0]["id"]))
    assert job.input["narrative"]["caller_name_source"] == CALLER_NAME_SOURCE
    assert job.input["narrative"]["address_record_id"] == a["id"]
    job = await claim(db_session)
    text, metadata = compose(job)
    assert await finish(db_session, job.id, job.worker_id, text, metadata)
    card = await db_session.get(CardTemplate, job.card_template_id)
    assert card.data["caller_name"] == name
    assert card.data["caller_details"]["gender"] == "Женский"
    assert name in card.caller_message
    assert a["street"] in card.caller_message


async def test_map_address_parts_and_point_survive_generation(teaching, db_session):
    point = {"latitude": 55.757, "longitude": 37.611}
    request = payload(
        teaching,
        mode="template",
        locality="Москва",
        street="Тверская улица",
        house="10",
        building="2",
        structure="1",
        address_format="structured",
        location=point,
    ) | {"count": 1}
    jobs = await teaching.post("card-generations", request, expected=202)
    assert "корп. 2, стр. 1" in jobs[0]["address_text"]
    job = await claim(db_session)
    assert job.input["card"]["data"]["additional_fields"]["location"] == point
    text, metadata = compose(job)
    assert await finish(db_session, job.id, job.worker_id, text, metadata)
    card = await db_session.get(CardTemplate, job.card_template_id)
    assert card.data["additional_fields"]["location"] == point
    assert card.data["address_details"]["building"] == "2"
    assert card.data["address_details"]["structure"] == "1"
    assert "корп. 2, стр. 1" in card.caller_message


def test_map_point_requires_a_fixed_address():
    from pydantic import ValidationError

    for parameters in (
        {"location": {"latitude": 55.7, "longitude": 37.6}},
        {"building": "2"},
        {
            "location": {"latitude": 91.0, "longitude": 37.6},
            "locality": "Москва",
            "street": "Тверская",
            "house": "1",
        },
    ):
        with pytest.raises(ValidationError):
            GenerationParameters(**parameters)
