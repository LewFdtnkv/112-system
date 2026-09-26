import importlib.util
from pathlib import Path
from uuid import UUID

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

pytestmark = pytest.mark.anyio


async def test_number_is_stable_in_attempt_draft_and_journal(exercise):
    e = exercise
    first = await e.start()
    card = first["card"]
    UUID(card["id"])
    number = card["display_number"]
    assert type(number) is int and number > 0
    saved = await e.fill(first)
    assert saved["card"]["display_number"] == number
    reopened = await e.request("POST", f"student/assignments/{first['assignment_id']}/start")
    assert reopened["card"]["display_number"] == number
    await e.request(
        "POST", f"student/attempts/{first['id']}/submit", {"revision": saved["card"]["revision"]}
    )
    second = await e.start(1)
    assert second["card"]["display_number"] > number
    journal = await e.request("GET", f"student/lessons/{e.lesson['id']}")
    assert [a["card"]["display_number"] for a in journal["assignments"] if a["card"]] == [
        number,
        second["card"]["display_number"],
    ]
    assert journal["assignments"][0]["card"]["id"] == card["id"]


async def test_migration_numbers_existing_rows_and_advances_sequence(db_session):
    # Temporary table shadows only this connection's production-shaped table.
    await db_session.execute(
        text(
            "CREATE TEMP TABLE incident_cards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
            "display_number varchar(50)) ON COMMIT DROP"
        )
    )
    await db_session.execute(
        text("INSERT INTO incident_cards(display_number) VALUES (NULL), ('legacy'), ('42')")
    )
    before = set((await db_session.execute(text("SELECT id FROM incident_cards"))).scalars())
    spec = importlib.util.spec_from_file_location(
        "incident_number_migration",
        Path(__file__).parents[1] / "alembic/versions/0029_incident_numbers.py",
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    connection = await db_session.connection()

    def migrate(sync, direction):
        migration.op = Operations(MigrationContext.configure(sync))
        getattr(migration, direction)()

    await connection.run_sync(migrate, "upgrade")
    rows = (await db_session.execute(text("SELECT id, display_number FROM incident_cards"))).all()
    assert {r.id for r in rows} == before
    numbers = {r.display_number for r in rows}
    assert len(numbers) == 3 and min(numbers) > 0
    added = await db_session.scalar(
        text("INSERT INTO incident_cards DEFAULT VALUES RETURNING display_number")
    )
    assert added > max(numbers)
    await connection.run_sync(migrate, "downgrade")
    assert set(
        (await db_session.execute(text("SELECT display_number FROM incident_cards"))).scalars()
    ) == {str(n) for n in numbers | {added}}
