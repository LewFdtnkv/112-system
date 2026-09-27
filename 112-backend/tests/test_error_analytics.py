from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import AIJob
from app.services.error_analytics.checks import observations
from app.services.error_analytics.report import aggregate
from app.services.semantic_assessment.rule_review import VERSION


def card(**changes):
    return (
        dict(
            status="completed",
            completed_at=datetime.now(UTC).isoformat(),
            teacher_reviewed=False,
            ai_status="succeeded",
            findings=[],
            student_id="student",
            lesson_id="lesson",
            student="Ученик",
            position=1,
            template_key="template",
            card_title="Пожар",
            role="operator_112",
            analytics_checks=[
                dict(key="address_details.street", label="Улица", skill="address", error=True)
            ],
        )
        | changes
    )


def stats(cards, **changes):
    return aggregate(
        cards, since=datetime.now(UTC) - timedelta(days=30), limit=20, offset=0, **changes
    )


def test_rates_skills_samples_scope_and_exclusions():
    good = dict(key="address_details.street", label="Улица", skill="address", error=False)
    result = stats(
        [
            card(),
            card(student_id="second", analytics_checks=[good]),
            card(template_key="rare", card_title="Другая"),
            card(teacher_reviewed=True),
            card(ai_status="running"),
            card(ai_status="failed"),
            card(analytics_checks=[]),
            card(completed_at=(datetime.now(UTC) - timedelta(days=31)).isoformat()),
            card(status="in_progress"),
        ]
    )
    assert result["summary"] == dict(
        checked=4,
        errors=3,
        error_percent=75,
        students=2,
        teacher_reviewed=1,
        pending_ai=1,
        incomplete_ai=1,
        ungraded=1,
    )
    rows = result["cards"]["items"]
    assert [r["title"] for r in rows] == ["Другая", "Пожар"]
    assert rows[1]["skills"]["address"] == dict(checked=3, errors=2, error_percent=66.7)
    assert rows[1]["students"] == 2
    assert result["fields"][0]["checked"] == 4
    assert "classification" not in rows[1]["skills"]


def test_112_dds_and_multiple_fields_are_not_double_counted():
    first = card()
    first["analytics_checks"].append(
        dict(key="address_details.house", label="Дом", skill="address", error=True)
    )
    result = stats(
        [
            first,
            card(
                role="dds",
                analytics_checks=[
                    dict(key="dds.timing.opening", label="Открытие", skill="dds_timing", error=True)
                ],
            ),
        ]
    )
    assert result["cards"]["total"] == 2
    row = next(r for r in result["cards"]["items"] if r["role"] == "operator_112")
    assert row["skills"]["address"]["errors"] == 1


def test_effective_ai_field_corrections_and_unresolved_services():
    def field(path, matched):
        return dict(
            field=path, label=path, scored=True, status="matched" if matched else "different"
        )

    evaluation = SimpleNamespace(context_snapshot={"rule_review_policy": VERSION})
    criteria = [
        SimpleNamespace(
            criterion_snapshot={
                "fields": [
                    field("caller_name", True),
                    field("recipients", False),
                    field("description", True),
                    dict(field("ignored", False), scored=False),
                ]
            }
        )
    ]
    rule = dict(
        code="rule.caller_name", rule_check=dict(field="caller_name", credit=1, status="matched")
    )
    job = SimpleNamespace(
        status="succeeded",
        input={
            "rule_review_policy": VERSION,
            "criteria": [rule, dict(code="additional_services"), dict(code="description")],
        },
        output={
            "findings": [
                dict(code="rule.caller_name", applied=True, credit=0),
                dict(code="description", label="Описание", applied=True, credit=1),
                dict(code="additional_services", label="Службы", applied=False, credit=None),
            ]
        },
    )
    checks = observations(evaluation, criteria, job)
    assert checks == [
        dict(key="caller_name", label="caller_name", skill="caller", error=True),
        dict(key="description", label="Описание", skill="description", error=False),
    ]
    job.status = "failed"
    assert observations(evaluation, criteria, job) == [
        dict(key="caller_name", label="caller_name", skill="caller", error=False)
    ]


@pytest.mark.anyio
async def test_endpoint_scope_filters_and_latest_manual_review(exercise, db_session):
    e = exercise
    await e.complete(0)
    await e.complete(1)
    await e.complete(2)
    # No model calls: keep the rules-only evidence, mark unavailable AI explicitly.
    for job in await db_session.scalars(select(AIJob).where(AIJob.purpose == "evaluation")):
        job.status = "failed"
    await db_session.commit()
    path = "views/analytics/errors"
    result = await e.request("GET", path, actor="teacher")
    assert result["summary"]["checked"] == 3
    filtered = await e.request(
        "GET", path + f"?days=30&group_id={e.d.payload['group_id']}", actor="teacher"
    )
    assert filtered["summary"]["checked"] == 3
    assert result["cards"]["total"] == 2
    assert sorted(c["checked"] for c in result["cards"]["items"]) == [1, 2]
    assert "HIDDEN_TEACHER_ANSWER" not in str(result)
    assert (await e.request("GET", path + "?limit=1&offset=1", actor="teacher"))["cards"][
        "items"
    ] == result["cards"]["items"][1:2]
    for suffix in ("?role=dds", "?track=assessment"):
        assert (await e.request("GET", path + suffix, actor="teacher"))["summary"]["checked"] == 0
    assert (await e.request("GET", path, actor="other"))["cards"]["total"] == 0
    await e.request("GET", path, status=403)
    await e.request("GET", path, actor="admin", status=403)
    await e.request("GET", path + "?days=0", actor="teacher", status=422)
    await e.request("GET", path + f"?group_id={e.d.payload['group_id']}", actor="other", status=404)
    await e.request(
        "POST",
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/evaluations",
        {
            "request_id": str(uuid4()),
            "expected_revision": 1,
            "score": 80,
            "max_score": 100,
            "comment": "Ответы подходят",
        },
        actor="teacher",
        status=201,
    )
    reviewed = await e.request("GET", path, actor="teacher")
    assert reviewed["summary"]["teacher_reviewed"] == 3
    assert reviewed["cards"]["total"] == 0


@pytest.mark.anyio
async def test_historical_unscored_evaluation_is_not_a_result(exercise, db_session):
    from app.models import Evaluation

    e = exercise
    await e.complete(0)
    evaluation = await db_session.scalar(select(Evaluation))
    evaluation.score = evaluation.max_score = None
    job = await db_session.scalar(select(AIJob).where(AIJob.purpose == "evaluation"))
    job.status = "succeeded"
    job.output = {
        "findings": [
            {
                "code": "description",
                "label": "Описание",
                "applied": True,
                "credit": 1,
                "reason": "Верно",
            }
        ]
    }
    await db_session.commit()
    report = await e.request("GET", "views/analytics/errors?days=90", actor="teacher")
    assert report["summary"]["ungraded"] == 1
    assert report["summary"]["checked"] == 0
