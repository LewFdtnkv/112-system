from copy import deepcopy

import pytest
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.schemas.student import StudentAttemptRead
from app.services.field_evaluation import check_fields, summarize

pytestmark = pytest.mark.anyio


async def test_normalization_omissions_and_free_text(exercise):
    attempt = StudentAttemptRead.model_validate(await exercise.complete())
    snapshot = {
        "classifier_entry_id": str(exercise.t.entry.id),
        "recipients": [{"service_id": str(exercise.t.service.id), "name": "Учебная ДДС"}],
        "data": {
            "caller_name": "Семёнов Иван",
            "caller_phone": "+7 (999) 111-22-33",
            "description": "Упало дерево",
            "address_details": {
                "locality": "Москва",
                "street": "Садовая",
                "house": "12/1",
                "apartment": "5",
            },
            "features": {"victimsCount": 0},
        },
    }
    attempt.card.data.caller_name = "  семенов   Иван "
    attempt.card.data.caller_phone = "89991112233"
    attempt.card.data.address_details = {"locality": "МОСКВА", "street": "садовая", "house": "121"}
    attempt.card.data.features = {"victimsCount": 0}
    check = check_fields(snapshot, attempt)
    by_key = {field.field: field for field in check.fields}
    assert by_key["caller_name"].status == by_key["caller_phone"].status == "matched"
    assert by_key["address_details.house"].status == "different"
    assert by_key["address_details.apartment"].status == "missing"
    assert by_key["description"].status == "needs_review" and not by_key["description"].scored
    assert by_key["features.victimsCount"].status == "matched"
    assert check.earned_points == 7 and check.possible_points == 9
    assert check.score_percent == 77.78
    alternate = deepcopy(snapshot)
    alternate["data"]["description"] = attempt.card.data.description
    assert check_fields(alternate, attempt).score_percent == check.score_percent
    assert summarize([]).score_percent is None


async def test_review_aggregate_uses_snapshot_and_is_teacher_only(exercise, db_session):
    from uuid import UUID

    from app.models import CardTemplate

    e = exercise
    prefix = f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/work"
    unstarted = await e.request("GET", prefix, actor="teacher")
    assert unstarted["automatic_check"]["score_percent"] is None
    assert unstarted["assignments"][0]["automatic_check"] is None
    # Editing a reusable template must not replace the lesson's immutable reference.
    template = await db_session.get(CardTemplate, UUID(e.d.second["id"]))
    template.data = {**template.data, "description": "NEW_REFERENCE"}
    await db_session.commit()
    for index in range(3):
        result = await e.complete(index)
        assert "automatic_check" not in result and "HIDDEN_TEACHER_ANSWER" not in str(result)
    review = await e.request("GET", prefix, actor="teacher")
    check = review["automatic_check"]
    assert check["earned_points"] == check["possible_points"] == 6
    assert check["score_percent"] == 100 and check["needs_review"] == 6
    assert "fields" not in check  # Aggregate does not repeat all per-card answers.
    assert "HIDDEN_TEACHER_ANSWER" in str(review) and "NEW_REFERENCE" not in str(review)
    for actor, status in (("student", 403), ("admin", 403), ("other", 404)):
        await e.request("GET", prefix, actor=actor, status=status)
