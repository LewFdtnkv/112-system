import copy
import json

import pytest
from test_semantic_assessment import decision, model_job

from app.services.generation.prose import assemble, generation_prompt, source, validate_message
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
