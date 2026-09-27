from copy import deepcopy
from types import SimpleNamespace

import pytest
from test_teacher_api import teaching as teaching

from app.services.authoring.card_validation import field_error

pytestmark = pytest.mark.anyio


def dds(profile_id):
    return {
        "workflow": "crews-v1",
        "service_profile_id": str(profile_id),
        "initial_crews": [],
        "required_crews": [{"crew_code": "main", "status": "arrived"}],
        "messages": [{"crew_code": "main", "message": "Бригада прибыла по адресу."}],
    }


async def test_mismatched_service_is_linked_to_profile_on_create_and_update(teaching, db_client):
    t = teaching
    payload = t.card_payload | {"dds_exercise": dds(t.profile.id)}
    card = await t.post("cards", payload)
    invalid = payload | {"recipient_service_ids": [], "use_recommended_recipients": False}
    for method, path, body in (
        ("POST", "/api/v1/cards", invalid),
        ("PUT", f"/api/v1/cards/{card['id']}", invalid | {"revision": 1}),
    ):
        response = await db_client.request(method, path, headers=t.headers["teacher"], json=body)
        assert response.status_code == 422, response.text
        error = response.json()["detail"][0]
        assert error["loc"] == ["body", "dds_exercise", "service_profile_id"]
        assert error["type"] == "card_constraint"
        assert "Добавьте её в список служб" in error["msg"]
    # The refused update neither changes the saved card nor consumes its revision.
    response = await db_client.put(
        f"/api/v1/cards/{card['id']}",
        headers=t.headers["teacher"],
        json=payload | {"revision": 1},
    )
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("problem", ["status", "time", "goal"])
async def test_dds_semantic_errors_point_to_actual_control(teaching, problem):
    t = teaching
    exercise = dds(t.profile.id)
    exercise["initial_crews"] = [
        {
            "crew_code": "main",
            "history": [
                {"status": "assigned", "seconds_before_start": 300},
                {"status": "responding", "seconds_before_start": 120},
            ],
        }
    ]
    if problem == "status":
        exercise["initial_crews"][0]["history"][0]["status"] = "arrived"
        path = ["initial_crews", 0, "history", 0, "status"]
        message = "начинаться с назначения"
    elif problem == "time":
        exercise["initial_crews"][0]["history"][1]["seconds_before_start"] = 600
        path = ["initial_crews", 0, "history", 1, "seconds_before_start"]
        message = "от ранних к поздним"
    else:
        exercise["required_crews"][0]["status"] = "assigned"
        path = ["required_crews", 0, "status"]
        message = "уже выполнена"
    result = await t.post("cards", t.card_payload | {"dds_exercise": exercise}, expected=422)
    error = result["detail"][0]
    assert error["loc"] == ["body", "dds_exercise", *path]
    assert error["type"] == "card_constraint"
    assert message in error["msg"]


async def test_missing_feature_locates_field_but_optional_features_remain_optional(teaching):
    t = teaching
    t.entry.conditions = {
        "format": "typed-features-v1",
        "features": [
            {
                "key": "original",
                "label": "Номер исходной карточки",
                "type": "text",
                "required": False,
            },
            {"key": "details", "label": "Новые сведения", "type": "text", "required": True},
        ],
    }
    await t.db_session.flush()
    payload = deepcopy(t.card_payload)
    result = await t.post("cards", payload, expected=422)
    assert result["detail"][0]["loc"] == ["body", "data", "features", "ekp", "details"]
    assert "Новые сведения" in result["detail"][0]["msg"]
    payload["data"]["features"] = {"ekp": {"details": "Прибыла бригада"}}
    await t.post("cards", payload)


def test_unknown_errors_are_not_exposed_as_safe_card_messages():
    assert field_error("internal sensitive details", SimpleNamespace(conditions={})) is None


async def test_scenario_without_dds_exercise_identifies_cards(teaching):
    t = teaching
    card = await t.post("cards", t.card_payload)
    result = await t.post(
        "scenarios",
        {
            "title": "Несовместимые карточки",
            "role": "dds",
            "service_profile_id": str(t.profile.id),
            "card_ids": [card["id"]],
        },
        expected=422,
    )
    assert result["detail"][0]["loc"] == ["body", "card_ids"]
    assert result["detail"][0]["type"] == "form_constraint"
    assert card["title"] in result["detail"][0]["msg"]


def test_incompatible_skill_retains_explanation_and_readable_name():
    from fastapi import HTTPException

    from app.schemas.learning import LearningPolicy
    from app.services.learning_scope import validate_exercise

    policy = LearningPolicy(kind="skill_practice", target_skills=["address"])
    with pytest.raises(HTTPException) as error:
        validate_exercise(
            policy,
            SimpleNamespace(role="operator_112"),
            [
                SimpleNamespace(snapshot={"title": "Консультация", "data": {}}),
            ],
        )
    issue = error.value.detail[0]
    assert issue["loc"] == ["body", "learning", "target_skills"]
    assert "«Адрес»" in issue["msg"] and "Консультация" in issue["msg"]
