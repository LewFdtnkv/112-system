import copy
import json
from types import SimpleNamespace

import pytest
from test_semantic_assessment import decision, model_job

from app.services.generation import llm
from app.services.generation.narration import fallback
from app.services.generation.prose import (
    Narration,
    assemble,
    exact_service_source,
    generation_prompt,
    source,
    validate_message,
)
from app.services.generation.protection import protect
from app.services.semantic_assessment.inference import evaluate
from app.services.semantic_assessment.prompts import messages
from app.services.semantic_assessment.recovery import AssessmentFailure, failure_details
from app.services.semantic_assessment.response_guards import normalize_recommendation
from scripts.evaluate_generation import sample


@pytest.mark.parametrize("seed", range(5))
def test_service_messages_do_not_request_unavailable_address(seed):
    data = sample("consultation-numbers", seed=seed)
    prompt = generation_prompt(data, ["Это [АДРЕС]. Меня зовут [ИМЯ]."])
    assert "[АДРЕС]" not in prompt
    assert "Сначала назови место" not in prompt
    message = " ".join(source(data)[1])
    validate_message(data, message)
    with pytest.raises(ValueError, match="убери лишние.*АДРЕС"):
        validate_message(data, message + " Это [АДРЕС].")


@pytest.mark.parametrize("age", [21, 34, 90])
def test_sms_age_stays_with_caller_outside_model(age):
    data = sample(
        "fire-rubbish",
        parameters={
            "message_format": "sms",
            "caller_information": "full",
            "age": age,
            "caller_name": "Анна Иванова",
            "gender": "female",
            "has_victims": True,
            "victims_count": 1,
        },
    )
    message = " ".join(source(data)[1])
    assert str(age) not in message
    assert str(age) not in generation_prompt(data)
    result = assemble(data, message).caller_message
    assert f"Мне {age}" in result
    assert "В ходе уточнения" not in result
    with pytest.raises(ValueError):
        validate_message(data, message + f" Помогите человеку, ему {age} лет.")
    with pytest.raises(ValueError):
        validate_message(data, message + " Пострадавшему девяносто лет.")


@pytest.mark.parametrize("extra", ["У меня зовут [ИМЯ].", "Я паникую."])
def test_known_unnatural_phrases_are_rejected(extra):
    data = sample("medical-faint")
    message = " ".join(source(data)[1]).replace("Меня зовут [ИМЯ].", "")
    if "[ИМЯ]" not in extra:
        message += " Меня зовут [ИМЯ]."
    with pytest.raises(ValueError):
        validate_message(data, message + " " + extra)


def test_medical_state_is_not_replaced_with_mobility():
    data = sample("medical-faint")
    with pytest.raises(ValueError, match="Не заменяй потерю сознания"):
        validate_message(
            data, "Человек потерял сознание, дышит, но не встаёт. Это [АДРЕС]. Я [ИМЯ]."
        )
    fall = sample("medical-self-fall")
    validate_message(fall, " ".join(source(fall)[1]))


def test_caller_name_cannot_be_reassigned_to_victim():
    data = sample("medical-faint")
    message = " ".join(source(data)[1]).replace("Меня зовут [ИМЯ].", "Пострадавшего зовут [ИМЯ].")
    with pytest.raises(ValueError, match="Имя относится к заявителю"):
        validate_message(data, message)


@pytest.mark.parametrize("template", ["wrong-number", "medical-self-fall"])
def test_unknown_gender_uses_neutral_self_description(template):
    data = sample(
        template,
        parameters={
            "caller_information": "name_only",
            "caller_name": "Екатерина",
        },
    )
    text = fallback(data).caller_message
    assert "ошибся" not in text and "Я упал" not in text
    assert data["facts"]["Пол"] is None
    message = " ".join(source(data)[1])
    validate_message(data, message)
    with pytest.raises(ValueError, match="Пол неизвестен"):
        validate_message(data, message + " Я упал.")


def test_unchanged_service_request_does_not_need_an_ai_critic(monkeypatch):
    data = sample(
        "consultation-numbers",
        parameters={
            "caller_information": "anonymous",
            "message_format": "sms",
        },
    )
    message = " ".join(source(data)[1])

    def request(model, prompt, schema, **kwargs):
        assert schema is Narration
        return Narration(message=message), {}

    monkeypatch.setattr(llm, "request", request)
    text, metadata = llm.compose(SimpleNamespace(input=data, model_version="test"))
    assert metadata["review_source"] == "exact-source"
    assert protect(data, text, metadata)[1]["source"] == "assisted"
    assert not exact_service_source(data, message + " Огонь!")
    corrupted = {**metadata, "draft": message + " Огонь!"}
    assert protect(data, text, corrupted)[1]["source"] == "template-fallback"


def test_negative_operational_flags_remain_in_call_clarifications():
    data = sample("medical-self-fall", parameters={"blocked": False, "refused_ambulance": False})
    text = assemble(data, " ".join(source(data)[1])).caller_message
    speech, clarification = text.split("В ходе уточнения выяснено:")
    assert "Сюда можно добраться" not in speech
    assert "От скорой никто не отказывался" not in speech
    assert "Сюда можно добраться" in clarification
    assert "От скорой никто не отказывался" in clarification


def test_dds_scope_examples_remain_when_rag_supplies_other_examples():
    criterion = model_job(kind="dds").input["criteria"][0]
    criterion["_retrieved_examples"] = [
        {
            "condition": "Все работы завершены",
            "answer": "Бригада прибыла",
            "verdict": "incorrect",
            "reason": "Старый пример",
        }
    ]
    prompt = messages(criterion, {})
    assert "не требуй" in prompt[0]["content"].lower()
    assert "432" in prompt[1]["content"]
    assert "Задачу получил" in prompt[1]["content"]


def test_retry_resumes_completed_criteria_but_discards_changed_evidence():
    job = model_job()
    job.context = {}
    job.input["criteria"].append({**job.input["criteria"][0], "code": "second"})
    calls = []

    def first(criterion, *args):
        calls.append(criterion["code"])
        if criterion["code"] == "second":
            raise TimeoutError("http://private:secret@provider")
        return decision(), {}

    with pytest.raises(AssessmentFailure) as failure:
        evaluate(job, first)
    error = failure.value
    assert error.diagnostic["category"] == "timeout"
    assert error.diagnostic["criterion"] == "second"
    assert "secret" not in json.dumps(error.diagnostic)
    assert len(error.checkpoint["findings"]) == 1
    job.context["assessment_checkpoint"] = error.checkpoint
    calls.clear()

    def success(criterion, *args):
        calls.append(criterion["code"])
        return decision(), {}

    result = evaluate(job, success)
    assert calls == ["second", "second"]
    assert len(result["findings"]) == 2
    for change in ("input", "model", "retrieval"):
        changed = copy.deepcopy(job)
        if change == "input":
            changed.input["submitted_facts"]["address"] = "Другое место"
        elif change == "model":
            changed.model_version = "new-model"
        else:
            changed.context["retrieval"] = {"status": "unavailable"}
        calls.clear()
        evaluate(changed, success)
        assert calls == ["description", "description", "second", "second"]


def test_failure_on_verification_cannot_cache_unconfirmed_grade():
    job = model_job()

    def invoke(c, f, m, verification=False):
        if verification:
            raise ValueError("Incomplete semantic response")
        return decision(), {}

    with pytest.raises(AssessmentFailure) as failure:
        evaluate(job, invoke)
    assert failure.value.diagnostic["stage"] == "verification"
    assert failure.value.diagnostic["category"] == "incomplete_response"
    assert failure.value.checkpoint["findings"] == []
    assert len(failure.value.checkpoint["trace"]) == 1
    assert failure_details(ValueError("private data")) == {"category": "internal"}


def test_advice_cannot_demand_verbatim_copying_for_description():
    result = decision().model_copy(
        update={
            "verdict": "incorrect",
            "recommendation": "Исправьте текст на точное воспроизведение сообщения заявителя.",
        }
    )
    guarded, metadata = normalize_recommendation({"code": "description"}, result)
    assert "своими словами" in guarded.recommendation
    assert guarded.verdict == result.verdict and guarded.reason == result.reason
    assert metadata["recommendation_guard"]["original"] == result.recommendation
    # Structured address corrections may legitimately demand exact values.
    assert normalize_recommendation({"code": "address_text"}, result) == (result, {})


def test_numeric_garbage_does_not_invent_a_separate_code_field():
    result = decision().model_copy(
        update={
            "verdict": "incorrect",
            "recommendation": "Код должен быть в другом поле.",
        }
    )
    guarded, metadata = normalize_recommendation(
        {"code": "description", "answer": "214214"}, result
    )
    assert "своими словами" in guarded.recommendation
    assert "другом поле" not in guarded.recommendation
    assert metadata["recommendation_guard"]["original"] == result.recommendation
