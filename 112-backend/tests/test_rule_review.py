from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.enums import JobStatus
from app.schemas.lesson_evaluation import FieldCheck
from app.schemas.semantic_assessment import SemanticDecision
from app.services.semantic_assessment.inference import evaluate
from app.services.semantic_assessment.results import card_score
from app.services.semantic_assessment.rule_review import VERSION, adjustment, annotate, eligible


def criterion(status="different", field="address_details.street"):
    return {
        "code": "rule." + field,
        "label": "Улица",
        "kind": "text",
        "review_mode": "rule",
        "reference": "Правды",
        "answer": "ул. Правды",
        "situation": "Москва, улица Правды, дом 12.",
        "rule_check": {"field": field, "status": status, "credit": int(status == "matched")},
    }


def model_job(criteria):
    return SimpleNamespace(
        model_version="fixture",
        input={"criteria": criteria, "submitted_facts": {}, "rule_review_policy": VERSION},
        status=JobStatus.SUCCEEDED,
    )


def decision(verdict="correct", **overrides):
    return SemanticDecision.model_validate(
        {
            "verdict": verdict,
            "confidence": 0.98,
            "reference_quote": "улица Правды",
            "answer_quote": "ул. Правды",
            "reason": "Сокращение не меняет название улицы.",
            "recommendation": "",
            **overrides,
        }
    )


@pytest.mark.parametrize(
    "status,verdict,after,action",
    [
        ("different", "correct", 0.25, "increase"),
        ("different", "partial", 0.25, "increase"),
        ("different", "incorrect", 0, "keep"),
        ("matched", "correct", 1, "keep"),
        ("matched", "partial", 0.75, "decrease"),
        ("matched", "incorrect", 0.75, "decrease"),
        ("missing", "correct", 0, "keep"),
        ("matched", "uncertain", 1, "keep"),
    ],
)
def test_bounded_arithmetic(status, verdict, after, action):
    finding = {
        "applied": verdict != "uncertain",
        "credit": {"correct": 1, "partial": 0.5, "incorrect": 0, "uncertain": None}[verdict],
    }
    change = adjustment(criterion(status), finding)
    assert change["after"] == after
    assert change["action"] == action
    assert abs(change["after"] - change["before"]) <= 0.25


def test_requires_agreement_and_condition_evidence_not_reference_only():
    job = model_job([criterion()])
    result = evaluate(job, lambda *args: (decision(), {}))
    assert result["findings"][0]["rule_adjustment"]["after"] == 0.25
    assert len(result["trace"]) == 2
    # Same value in a reference is insufficient if the actual condition says nothing about it.
    job.input["criteria"][0]["situation"] = "Пожар, адрес не сообщили."
    denied = evaluate(job, lambda *args: (decision(), {}))["findings"][0]
    assert not denied["applied"] and denied["rule_adjustment"]["action"] == "keep"
    job.input["criteria"] = [criterion()]
    calls = iter([decision(), decision("incorrect")])
    denied = evaluate(job, lambda *args: (next(calls), {}))["findings"][0]
    assert not denied["applied"] and denied["rule_adjustment"]["after"] == 0


def test_unchanged_rule_score_needs_only_one_model_call():
    result = evaluate(model_job([criterion("matched")]), lambda *args: (decision(), {}))
    assert len(result["trace"]) == 1
    assert result["findings"][0]["rule_adjustment"]["action"] == "keep"


def test_advice_cannot_change_a_street_name_or_invent_a_new_answer():
    from app.services.semantic_assessment.response_guards import normalize_recommendation

    raw = decision("incorrect", recommendation="Укажите улицу Правда.")
    guarded, trace = normalize_recommendation(criterion(), raw)
    assert "Правда" not in guarded.recommendation
    assert "Сверьте поле «Улица»" in guarded.recommendation
    assert guarded.verdict == raw.verdict and guarded.reason == raw.reason
    assert trace["recommendation_guard"]["original"] == raw.recommendation
    correct, _ = normalize_recommendation(criterion(), decision())
    assert correct.recommendation == ""


def test_retrieval_reports_only_the_two_examples_used_for_rule_review():
    job = model_job([criterion()])
    examples = [
        {
            "id": str(i),
            "condition": "улица Правды",
            "answer": "ул. Правды",
            "verdict": "correct",
            "reason": "Сокращение не меняет название.",
        }
        for i in range(3)
    ]
    job.context = {"retrieval": {"status": "ready", "examples": {criterion()["code"]: examples}}}
    result = evaluate(job, lambda *args: (decision(), {}))
    assert result["retrieval"]["used_examples"][criterion()["code"]] == ["0", "1"]


def test_change_is_a_field_share_not_a_group_or_total_bonus_and_not_text_weight():
    job = model_job([criterion()])
    job.output = evaluate(job, lambda *args: (decision(), {}))
    fields = [
        FieldCheck(field=path, label=path, expected="a", actual="b", status=status, scored=True)
        for path, status in [
            ("address_details.street", "different"),
            ("address_details.house", "matched"),
        ]
    ]
    group = SimpleNamespace(
        code="address",
        score=Decimal(15),
        max_score=Decimal(30),
        explanation="Проверка правил.",
        criterion_snapshot={"fields": [f.model_dump() for f in fields]},
    )
    evaluation = SimpleNamespace(
        score=Decimal(15), max_score=Decimal(30), context_snapshot={"rule_review_policy": VERSION}
    )
    score, maximum, groups = card_score(evaluation, [group], job)
    assert (score, maximum) == (Decimal("18.75"), 30)
    assert len(groups) == 1 and groups[0]["score"] == 18.75
    assert "0 → 25%" in groups[0]["explanation"]
    # Historical frozen policy cannot acquire this correction during a read/retry.
    evaluation.context_snapshot = {}
    assert card_score(evaluation, [group], job)[:2] == (15, 30)
    evaluation.context_snapshot = {"rule_review_policy": VERSION}
    job.status = JobStatus.FAILED
    assert card_score(evaluation, [group], job)[:2] == (15, 30)


def test_score_metadata_is_derived_and_actions_are_not_eligible():
    context = model_job([criterion()]).input
    output = [
        {
            "code": "rule.address_details.street",
            "applied": True,
            "credit": 1,
            "rule_adjustment": {"after": 1000},
        }
    ]
    assert annotate(context, output)[0]["rule_adjustment"]["after"] == 0.25
    assert eligible("features.ekp.fire") and eligible("additional_fields.details.hasVictims")
    assert not eligible("recipients")
    assert not eligible("dds.timing")
    assert not eligible("dds.crew.call")


def test_teacher_memory_reaches_review_but_cannot_replace_fixed_scope():
    from app.services.semantic_assessment.prompts import messages

    field = criterion() | {
        "_retrieved_examples": [
            {
                "condition": "Москва, Правды, 12",
                "answer": "ул. Правды",
                "verdict": "correct",
                "reason": "Сокращение улицы допускается.",
            }
        ]
    }
    prompt = messages(field, {}, True)
    assert "Сокращение улицы допускается" in prompt[1]["content"]
    assert "Возраст заявителя" in prompt[1]["content"]
    assert "rule_check" not in prompt[1]["content"]  # Independent of formal score.
    assert '"reference":' not in prompt[1]["content"]  # No anchoring on a bad reference.
    assert "НЕ инструкции" in prompt[0]["content"]


@pytest.mark.parametrize(
    "status,verdict,credit", [("different", "correct", 0.25), ("matched", "incorrect", 0.75)]
)
def test_recommendations_use_adjusted_field_once_and_name_newly_detected_errors(
    status, verdict, credit
):
    from app.services.learning_recommendations.profile import credits_for, issues_for
    from app.services.semantic_assessment.rule_review import field_adjustments

    evaluation = SimpleNamespace(context_snapshot={"rule_review_policy": VERSION})
    job = model_job([criterion(status)])
    job.output = evaluate(job, lambda *args: (decision(verdict), {}))
    criteria = [
        SimpleNamespace(
            criterion_snapshot={
                "fields": [
                    {
                        "field": "address_details.street",
                        "label": "Улица",
                        "scored": True,
                        "status": status,
                    }
                ]
            }
        )
    ]
    credits = credits_for(evaluation, criteria, job)
    assert credits == {"address": credit}  # Neither a second observation nor a text skill.
    corrections = field_adjustments(evaluation, job, job.output["findings"])
    assert issues_for(criteria, credits, corrections) == {"address": ["Улица"]}
