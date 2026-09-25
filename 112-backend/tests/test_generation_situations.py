import json
import random
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.generation import GenerationParameters
from app.services.catalog_rules import feature_definitions, validate_answers
from app.services.generation.library import for_entry, library
from app.services.generation.llm import compose
from app.services.generation.narration import fallback
from app.services.generation.planner import build, choose
from app.services.generation.protection import protect


def entries():
    document = json.loads(
        (Path(__file__).parents[1] / "scripts/data/system112_catalog.json").read_text()
    )
    return [
        SimpleNamespace(
            name=row["name"],
            display_name=row["display_name"],
            conditions={
                "format": "typed-features-v1",
                "features": row["features"],
            },
        )
        for row in document["entries"]
    ]


def job_input(template_id="fire-rubbish", **overrides):
    from scripts.evaluate_generation import sample

    data = sample(template_id)
    data["narrative"].update(overrides)
    return data


def test_every_library_situation_matches_real_catalog_and_has_complete_evidence():
    seen = set()
    for entry in entries():
        for template in for_entry(entry):
            for seed in range(12):
                plan = build(entry, template, GenerationParameters(), random.Random(seed))
                validate_answers(feature_definitions(entry), plan["answers"])
                assert len(plan["phrases"]) == 2 and all(p.endswith(".") for p in plan["phrases"])
                assert plan["flags"]["hasVictims"] == (plan["victims_count"] > 0)
                if template.service_call:
                    assert not plan["flags"]["hasVictims"] and plan["object"] is None
            seen.add(template.id)
    assert seen == {t.id for t in library()[1]}


@pytest.mark.parametrize(
    "params",
    [
        {"object": "парк"},
        {"feature_answers": {"location": "В помещении", "equipment": "Плита", "flame": True}},
        {"has_victims": False, "victims_count": 2},
    ],
)
def test_conflicting_parameters_rejected_instead_of_handed_to_model(params):
    gas = next(e for e in entries() if e.name == "104")
    with pytest.raises(HTTPException) as error:
        choose(
            [gas],
            SimpleNamespace(**(GenerationParameters().model_dump() | params)),
            random.Random(3),
            {},
        )
    assert error.value.status_code == 422


def test_batch_prefers_unused_situations_and_preserves_fixed_values():
    road = next(e for e in entries() if e.name == "ДТП")
    usage, rng, ids = {}, random.Random(7), []
    for _ in range(4):
        _, plan = choose([road], GenerationParameters(has_victims=True, blocked=True), rng, usage)
        ids.append(plan["template_id"])
        assert plan["flags"]["hasVictims"] and plan["answers"]["trapped"]
    assert len(set(ids)) == 4


def test_hidden_parent_and_child_conflict_rejected():
    fire = next(e for e in entries() if e.name == "101")
    p = SimpleNamespace(
        **(
            GenerationParameters().model_dump()
            | {
                "feature_answers": {"where": "Дом", "transport_object": "Автомашина"},
            }
        )
    )
    with pytest.raises(HTTPException):
        choose([fire], p, random.Random(1), {})


def test_fallback_preserves_address_and_does_not_introduce_control_answer_table():
    data = job_input()
    text = fallback(data)
    assert "Лесная улица, д. 12" in text.caller_message
    assert "Лесная улица, д. 12" in text.description
    assert "горит мусор" in text.caller_message
    assert "Контрольные сведения" not in text.caller_message
    assert "в помещении" not in text.caller_message
    malicious = text.model_copy(update={"description": "Пожар в доме 4 на втором этаже."})
    secured, metadata = protect(
        data, malicious, {"selection": data["narrative"]["default_wording"]}
    )
    assert secured == text and metadata["source"] == "template-fallback"


def test_model_rejects_obsolete_choices_instead_of_claiming_prose_success(monkeypatch):
    import io
    import urllib.request

    class Client:
        def open(self, request, timeout):
            payload = json.loads(request.data)
            assert "Лесная" not in payload["messages"][0]["content"]
            assert timeout <= 300
            return io.BytesIO(
                json.dumps(
                    {
                        "done": True,
                        "message": {
                            "content": json.dumps(
                                {
                                    "wording": 9,
                                    "opening": 1,
                                    "order": 0,
                                    "text": "Новое происшествие",
                                }
                            )
                        },
                    }
                ).encode()
            )

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args: Client())
    data = job_input()
    text, metadata = compose(SimpleNamespace(input=data, model_version="test"))
    assert metadata["source"] == "template-fallback" and text == fallback(data)


def test_template_mode_never_calls_model(monkeypatch):
    import urllib.request

    def forbidden(*args):
        raise AssertionError("Unexpected network")

    monkeypatch.setattr(urllib.request, "build_opener", forbidden)
    data = job_input(mode="template")
    text, metadata = compose(SimpleNamespace(input=data, model_version="test"))
    assert metadata["source"] == "template" and "горит мусор" in text.caller_message


def test_every_boolean_reference_has_observable_evidence():
    data = job_input("road-collision")
    text = fallback(data)
    # Optional, unrequested negatives are unknown, not scored answers.
    assert "fire" not in data["narrative"]["answers"]
    assert "trapped" not in data["narrative"]["answers"]
    assert "Никто не пострадал" in text.caller_message
