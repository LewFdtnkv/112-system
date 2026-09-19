from uuid import uuid4

import pytest
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

pytestmark = pytest.mark.anyio


async def test_page_projections_scope_search_and_pagination(exercise):
    e = exercise
    teacher = dict(actor="teacher")
    page = await e.request("GET", "views/lessons?limit=1", **teacher)
    assert page["total"] == 1 and page["items"][0]["card_count"] == 3
    assert page["assigned_count"] == 1
    assert "HIDDEN_TEACHER_ANSWER" not in str(page)
    assert (await e.request("GET", "views/lessons?offset=1", **teacher))["items"] == []
    assert (await e.request("GET", "views/lessons?q=nonexistent", **teacher))["total"] == 0
    assert (await e.request("GET", "views/lessons", actor="other"))["total"] == 0
    assert (await e.request("GET", "views/student/lessons"))["total"] == 1
    assert (await e.request("GET", "views/student/lessons", actor="student2"))["total"] == 0
    await e.request("GET", "views/lessons", status=403)
    await e.request("GET", "views/lessons", actor="admin", status=403)
    for path in ["views/groups", "views/cards", "views/scenarios", "views/users"]:
        result = await e.request("GET", path + "?limit=1", **teacher)
        assert len(result["items"]) == 1 and result["total"] >= 1
        assert "HIDDEN_TEACHER_ANSWER" not in str(result)
        assert (await e.request("GET", path + "?q=impossible-search", **teacher))["total"] == 0
    group_id = e.d.payload["group_id"]
    await e.request("GET", f"views/users?group_id={group_id}", actor="other", status=404)
    dashboard = await e.request("GET", "views/admin/dashboard", actor="admin")
    assert dashboard["users"] >= 5 and dashboard["services"] >= 1
    for path in ["views/admin/services", "views/admin/classifiers"]:
        assert (await e.request("GET", path, actor="admin"))["total"] >= 1
        await e.request("GET", path, **teacher, status=403)


async def test_journal_draft_classifier_preview_and_latest_grades(exercise):
    e = exercise
    first = await e.start()
    found = await e.request("GET", f"student/attempts/{first['id']}/classifier-entries?q=001")
    assert len(found) == 1
    assert (
        await e.request("GET", f"student/attempts/{first['id']}/classifier-entries?q=impossible")
        == []
    )
    preview = await e.request(
        "GET", f"student/attempts/{first['id']}/recipients?classifier_entry_id={e.t.entry.id}"
    )
    assert preview[0]["service_id"] == str(e.t.service.id)
    unchanged = await e.request("GET", f"student/attempts/{first['id']}")
    assert unchanged["card"]["classifier_entry_id"] is None
    filled = await e.fill(first)
    assert filled["classifier_entry"]["code"] == "001"
    assert filled["recipient_services"] == preview
    work = await e.request("GET", f"student/lessons/{e.lesson['id']}")
    assert work["assignments"][0]["card"]["description"] == "Слова ученика"
    assert "HIDDEN_TEACHER_ANSWER" not in str(work)
    page = await e.request("GET", "views/student/lessons")
    assert page["in_progress_count"] == 1
    await e.request(
        "POST", f"student/attempts/{first['id']}/submit", {"revision": filled["card"]["revision"]}
    )
    await e.complete(1)
    await e.complete(2)
    for revision, score in [(1, 20), (2, 80)]:
        await e.request(
            "POST",
            f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/evaluations",
            {
                "request_id": str(uuid4()),
                "expected_revision": revision,
                "score": score,
                "max_score": 100,
                "comment": "Проверено",
            },
            actor="teacher",
            status=201,
        )
    page = await e.request("GET", "views/student/lessons")
    assert page["graded_count"] == 1 and page["items"][0]["score"] == "80.00"
    stats = await e.request("GET", "views/analytics", actor="teacher")
    assert stats["graded"] == 1 and stats["average_score_percent"] == 80
    assert stats["scenarios"]["total"] == 1


async def test_versioned_scenario_edit_preserves_assigned_version(teaching):
    t = teaching
    d = await t.prepare()
    payload = {
        "title": "Новая редакция",
        "card_ids": [d.first["id"]],
        "role": "operator_112",
        "category": "Категория",
        "difficulty": "advanced",
        "duration_minutes": 25,
        "norm_seconds": 55,
        "status": "draft",
    }
    edited = await t.post(f"scenarios/{d.scenario['id']}/versions", payload)
    assert edited["version"] == 2 and edited["status"] == "draft"
    assert edited["scenario_id"] == d.scenario["scenario_id"]
    assert edited["norm_seconds"] == 55
    await t.post(f"scenarios/{d.scenario['id']}/versions", payload, actor="other", expected=404)


async def test_teacher_review_loads_cards_in_batches(exercise, db_session):
    from sqlalchemy import event

    e = exercise
    for index in range(3):
        await e.complete(index)
    queries = []
    connection = (await db_session.connection()).sync_connection

    def count_sql(*args):
        queries.append(args[2])

    event.listen(connection, "before_cursor_execute", count_sql)
    try:
        review = await e.request(
            "GET",
            f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/work",
            actor="teacher",
        )
    finally:
        event.remove(connection, "before_cursor_execute", count_sql)
    assert len(review["assignments"]) == 3
    assert all(row["source_classifier_entry"]["code"] == "001" for row in review["assignments"])
    assert len(queries) <= 10
