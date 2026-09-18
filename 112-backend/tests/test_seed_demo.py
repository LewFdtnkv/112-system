import json
import stat

import anyio
import pytest
from sqlalchemy import func, select

from app.models import Assignment, Attempt, Lesson, LessonEvaluation, TrainingGroup, User
from scripts import seed_demo


@pytest.mark.anyio
async def test_seed_from_admin_only_database_and_repeat(
    db_client, db_session, monkeypatch, tmp_path
):
    class InProcessAPI(seed_demo.API):
        def request(self, method, path, payload=None, expected=(200,)):
            async def send():
                headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
                return await db_client.request(
                    method, f"/api/v1/{path}", json=payload, headers=headers
                )

            response = anyio.from_thread.run(send)
            if response.status_code not in expected:
                raise seed_demo.APIError(method, path, response.status_code)
            return response.json() if response.content else None

    monkeypatch.setattr(seed_demo, "API", InProcessAPI)
    state_path = tmp_path / "state.json"
    first = await anyio.to_thread.run_sync(
        seed_demo.run, "http://test", state_path, "test", "admin"
    )
    second = await anyio.to_thread.run_sync(
        seed_demo.run, "http://test", state_path, "test", "admin"
    )
    assert first == second and first["evaluation"] == "4.00/5.00"
    for model, expected in [
        (User, 3),
        (TrainingGroup, 1),
        (Lesson, 2),
        (Assignment, 4),
        (Attempt, 2),
        (LessonEvaluation, 1),
    ]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == expected
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600
    state = json.loads(state_path.read_text())
    for account in state["accounts"].values():
        assert account["password"] not in json.dumps(first)
        assert account["initial_password"] not in json.dumps(first)
    assert state["admin_new_password"] not in json.dumps(first)
    with pytest.raises(RuntimeError, match="другому API"):
        seed_demo.State(state_path, "http://another", "test")
    assert json.loads(state_path.read_text()) == state
