import copy
from types import SimpleNamespace

import pytest

from app.services.generation import llm
from app.services.generation.narration import fallback
from app.services.generation.prose import (
    Narration,
    Review,
    generation_prompt,
    source,
    validate_message,
    validate_review,
)
from app.services.generation.protection import protect
from scripts.evaluate_generation import sample


def valid_review(data, message):
    facts = source(data)[1]
    return Review(covered=list(range(len(facts))), unsupported=[], contradictions=[])


def test_identifiers_are_slots_and_operator_observations_do_not_become_speech():
    data = sample("fire-rubbish")
    prompt = generation_prompt(data)
    assert "Анна Иванова" not in prompt and "Лесная" not in prompt
    assert data["card"]["data"]["caller_phone"] not in prompt
    assert "[ИМЯ]" in prompt and "[АДРЕС]" in prompt
    with pytest.raises(ValueError):
        validate_message(data, "На улице горит мусор. [АДРЕС]. Меня зовут другая женщина.")
    with pytest.raises(ValueError):
        validate_message(data, "Дом 999 горит! [АДРЕС]. Меня зовут [ИМЯ].")
    with pytest.raises(ValueError):
        validate_message(data, "Я женщина. [АДРЕС]. Меня зовут [ИМЯ].")


def test_critic_requires_every_fact_once_and_rejects_reported_errors():
    data = sample("medical-faint")
    message = " ".join(source(data)[1])
    review = valid_review(data, message)
    validate_review(data, message, review)
    for mutation in ("missing", "duplicate", "unsupported", "contradiction"):
        changed = review.model_dump()
        if mutation == "missing":
            changed["covered"].pop()
        if mutation == "duplicate":
            changed["covered"][-1] = 0
        if mutation == "unsupported":
            changed["unsupported"] = ["Пострадавший согласился"]
        if mutation == "contradiction":
            changed["contradictions"] = ["Не дышит вместо дышит"]
        with pytest.raises(ValueError):
            validate_review(data, message, changed)


def test_retry_and_publication_recheck_cannot_silently_change_facts(monkeypatch):
    data = sample("gas-stove")
    message = " ".join(source(data)[1])
    calls = []

    def request(model, prompt, schema, **kwargs):
        calls.append(schema)
        if schema is Narration:
            return Narration(message=message), {}
        review = valid_review(data, message)
        if len(calls) == 2:
            review.unsupported = ["Неподтверждённое обстоятельство"]
        return review, {}

    monkeypatch.setattr(llm, "request", request)
    text, metadata = llm.compose(SimpleNamespace(input=data, model_version="test"))
    assert calls == [Narration, Review, Narration, Review]
    assert metadata["source"] == "assisted"
    assert "Анна Иванова" in text.caller_message
    assert protect(data, text, metadata) == (text, metadata)
    changed = text.model_copy(update={"description": "Неподтверждённая новая причина происшествия"})
    assert protect(data, changed, metadata)[1]["source"] == "template-fallback"
    modified_input = copy.deepcopy(data)
    modified_input["facts"]["Адрес"] = "Другой адрес"
    assert protect(modified_input, text, metadata)[1]["source"] == "template-fallback"


def test_failed_critic_never_publishes_unchecked_prose(monkeypatch):
    data = sample("fire-rubbish")

    def request(model, prompt, schema, **kwargs):
        if schema is Narration:
            return Narration(message="Горит мусор. [АДРЕС]. [ИМЯ]."), {}
        raise TimeoutError("model unavailable")

    monkeypatch.setattr(llm, "request", request)
    text, metadata = llm.compose(SimpleNamespace(input=data, model_version="test"))
    assert text == fallback(data) and metadata["source"] == "template-fallback"
    assert len(metadata["attempts"]) == 1


def test_sms_gender_is_not_a_separate_utterance():
    data = sample(
        "fire-rubbish",
        parameters={
            "message_format": "sms",
            "caller_information": "full",
            "caller_name": "Анна Иванова",
            "gender": "female",
            "age": 34,
        },
    )
    text = fallback(data)
    assert "Я женщина" not in text.caller_message
    assert "Заявитель: женщина" in text.caller_message
    assert "Заявитель: женщина" not in generation_prompt(data)


def test_unknown_negative_claims_copied_from_examples_are_rejected():
    data = sample("road-collision", parameters={"has_victims": True, "victims_count": 2})
    message = " ".join(source(data)[1])
    validate_message(data, message)
    for claim in ("Никто не зажат.", "Машины не горят."):
        with pytest.raises(ValueError):
            validate_message(data, message + " " + claim)
    data = sample(
        "fire-rubbish",
        parameters={
            "message_format": "sms",
            "has_victims": None,
            "blocked": None,
            "refused_ambulance": None,
        },
        seed=501,
    )
    with pytest.raises(ValueError):
        validate_message(data, " ".join(source(data)[1]) + " Никто не пострадал.")


def test_blocked_people_do_not_invent_a_blocked_road():
    data = sample("road-collision", parameters={"has_victims": True, "blocked": True})
    text = fallback(data)
    assert "Люди заблокированы и не могут выбраться" in text.caller_message
    assert "Доступ к месту происшествия перекрыт" not in text.caller_message


def test_rich_examples_require_known_matching_facts():
    from app.services.generation.examples import builtins

    unknown = sample("fire-rubbish", parameters={"has_victims": None, "blocked": None}, seed=501)
    assert not builtins(unknown)[0].get("requires")
    known = sample("fire-rubbish", parameters={"has_victims": False, "blocked": False})
    assert builtins(known)[0]["requires"]["flags"] == {"hasVictims": False, "blocked": False}
    wrong_count = sample("road-collision", parameters={"has_victims": True, "victims_count": 1})
    assert builtins(wrong_count)[0]["id"] != "road-two-clear"


def test_caller_does_not_offer_operator_service_or_decline_fixed_address():
    data = sample("road-collision")
    message = " ".join(source(data)[1])
    for changed in (
        message.replace("Это [АДРЕС]", "на [АДРЕС]"),
        "Алло, могу помочь. " + message,
        message + " Всё это в живую, без лишних слов.",
        message + " Просьба о помощи.",
    ):
        with pytest.raises(ValueError):
            validate_message(data, changed)


@pytest.mark.parametrize(
    "age,word", [(11, "лет"), (21, "год"), (22, "года"), (34, "года"), (45, "лет")]
)
def test_caller_age_has_correct_russian_ending(age, word):
    data = sample(
        "fire-rubbish",
        parameters={
            "message_format": "sms",
            "caller_information": "full",
            "caller_name": "Анна Иванова",
            "gender": "female",
            "age": age,
        },
    )
    assert f"Мне {age} {word}." in fallback(data).caller_message
