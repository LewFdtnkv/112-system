"""Opt-in live-model experiment; run with pytest on a migrated isolated test DB.

Uses regular API fixtures, real feedback publication, pgvector and inference.
All database changes are rolled back by the test fixture. Never target the stand DB.
TEACHER_FEEDBACK_REPORT must point to a writable JSON report outside /tmp.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from conftest import (  # noqa: E402
    anyio_backend as anyio_backend,
)
from conftest import (
    auth_settings as auth_settings,
)
from conftest import (
    db_client as db_client,
)
from conftest import (
    db_session as db_session,
)
from test_student_workflow import exercise as exercise  # noqa: E402
from test_teacher_api import teaching as teaching  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.enums import JobStatus  # noqa: E402
from app.services.assessment_memory.library import seed  # noqa: E402
from app.services.assessment_memory.retrieval import index_pending, retrieve_batch  # noqa: E402
from app.services.generation_worker import claim  # noqa: E402
from app.services.semantic_assessment.inference import evaluate  # noqa: E402
from app.services.semantic_assessment.prompts import PROMPT_VERSION  # noqa: E402

CASES = [
    {
        "name": "smoke-or-fire",
        "criterion": {
            "kind": "text",
            "code": "description",
            "label": "Смысл сообщения",
            "situation": (
                "Из закрытого киоска идёт дым. Пламени снаружи не видно. Внутри никого не видно."
            ),
            "reference": "Дым из закрытого киоска, пламени не видно, наличие людей неизвестно.",
            "answer": "Пожар в киоске, наличие людей не установлено.",
        },
        "corrections": {
            "correct": (
                "Здесь «пожар» — повод для выезда по дыму, а не утверждение, что "
                "заявитель видел пламя."
            ),
            "incorrect": (
                "Дым ещё не подтверждает пожар. Ученик превратил предположение в "
                "установленный факт."
            ),
        },
    },
    {
        "name": "arrival-at-barrier",
        "criterion": {
            "kind": "dds",
            "code": "dds.comments",
            "label": "Смысл комментариев бригад",
            "situation": (
                "Бригада доехала до закрытого шлагбаума у въезда во двор. Место "
                "аварии за домом; дальше идут пешком."
            ),
            "reference": "Бригада у въезда во двор, к месту аварии идут пешком.",
            "answer": '[{"status":"arrived","comment":"Прибыли"}]',
        },
        "corrections": {
            "correct": (
                "Для прибытия достаточно добраться до двора. Дойти от машины до "
                "аварии можно после этой отметки."
            ),
            "incorrect": "Прибыли к шлагбауму, а не к месту аварии. Комментарий это скрывает.",
        },
    },
    {
        "name": "false-unconscious-control",
        "criterion": {
            "kind": "text",
            "code": "description",
            "label": "Смысл сообщения",
            "situation": "Мужчине плохо. Он сидит на скамейке и отвечает на вопросы заявителя.",
            "reference": "Мужчине плохо, в сознании, отвечает на вопросы.",
            "answer": "Мужчина без сознания.",
        },
        "corrections": {
            "correct": (
                "Зачесть: главное, что ученик понял необходимость скорой. Состояние "
                "сознания здесь неважно."
            ),
            "incorrect": (
                "Он отвечает на вопросы, значит сознание сохранено. Ученик написал противоположное."
            ),
        },
        "control": "Reject the deliberately wrong correction; source facts must prevail.",
    },
]


@pytest.mark.anyio
async def test_live_teacher_feedback(exercise, db_session):
    report_path = os.environ.get("TEACHER_FEEDBACK_REPORT")
    if not report_path:
        pytest.skip("Explicit TEACHER_FEEDBACK_REPORT required for costly live inference")
    prior = json.loads(Path(report_path).read_text()) if Path(report_path).exists() else {}
    e = exercise
    attempt = await e.complete()
    job = await claim(db_session)
    teacher_id = e.t.accounts["teacher"].id
    other_id = e.t.accounts["other"].id
    await seed(db_session)
    while await index_pending(db_session):
        pass
    report = {
        "model": settings.assessment_model or settings.llm_model,
        "prompt_version": PROMPT_VERSION,
        "threads": settings.llm_threads,
        "cases": [],
        "scope": "isolated synthetic fixtures; no production grades",
    }

    def save():
        Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    async def bundle(criterion, owner=teacher_id):
        # A fresh assessment: the source feedback job must not be the current job.
        return await retrieve_batch(
            db_session, [criterion], teacher_id=owner, source_job_id=uuid4()
        )

    async def run(record, mode, criterion, retrieval):
        started = time.monotonic()
        model_job = SimpleNamespace(
            model_version=report["model"],
            input={"criteria": [criterion], "submitted_facts": {}},
            context={"retrieval": retrieval},
        )
        result = await asyncio.to_thread(evaluate, model_job)
        record[mode] = {
            "retrieval": retrieval,
            "output": result,
            "seconds": round(time.monotonic() - started, 2),
        }
        save()
        print(record["name"], mode, result["findings"][0]["verdict"], flush=True)
        return result

    for case in CASES:
        record = {
            "name": case["name"],
            "criterion": case["criterion"],
            "control": case.get("control"),
        }
        report["cases"].append(record)
        criterion = case["criterion"]
        cached = next(
            (item for item in prior.get("cases", []) if item["criterion"] == criterion), None
        )
        if (
            cached
            and "baseline" in cached
            and prior.get("model") == report["model"]
            and prior.get("prompt_version") == PROMPT_VERSION
        ):
            baseline = cached["baseline"]["output"]
            record["baseline"] = cached["baseline"]
            record["baseline_reused_from_interrupted_run"] = True
        else:
            baseline = await run(record, "baseline", criterion, await bundle(criterion))
        first = baseline["trace"][0]["decision"]["verdict"]
        opposite = "incorrect" if first == "correct" else "correct"
        correction = {
            "request_id": str(uuid4()),
            "criterion_code": criterion["code"],
            "verdict": opposite,
            "reason": case["corrections"][opposite],
        }
        record["teacher_correction"] = correction
        job.input = {"criteria": [criterion], "submitted_facts": {}, "teacher_id": str(teacher_id)}
        job.status, job.output = JobStatus.SUCCEEDED, baseline
        await db_session.commit()
        path = (
            f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
            f"/attempts/{attempt['id']}/assessment-memory"
        )
        feedback = await e.request("POST", path, correction, actor="teacher")
        record["feedback_id"] = feedback["id"]
        while await index_pending(db_session):
            pass
        after = await bundle(criterion)
        record["foreign_teacher_excluded"] = all(
            item["id"] != feedback["id"]
            for items in (await bundle(criterion, other_id))["examples"].values()
            for item in items
        )
        await run(record, "after_feedback", criterion, after)
        await run(record, "after_feedback_repeat", criterion, after)
        await e.request("DELETE", path + "/" + feedback["id"], actor="teacher")
        await run(record, "after_withdrawal", criterion, await bundle(criterion))
        save()
