from types import SimpleNamespace
from uuid import UUID

import pytest
from test_teacher_api import teaching as teaching

from app.models import CardTemplate
from app.services.generation.examples import compatible, retrieve
from scripts.evaluate_generation import sample

pytestmark = pytest.mark.anyio


def test_examples_cannot_introduce_incompatible_or_unreported_states():
    plan = sample("road-collision", parameters={"has_victims": True, "victims_count": 2})[
        "narrative"
    ]
    card = SimpleNamespace(data={"features": {"ekp": {"vehicles": "Два"}, "victimsCount": 2}})
    assert compatible(card, plan)
    card.data["features"]["victimsCount"] = 3
    assert not compatible(card, plan)
    card.data["features"]["victimsCount"] = 2
    card.data["features"]["ekp"]["trapped"] = False
    assert not compatible(card, plan)  # Unknown is not false.
    del card.data["features"]["ekp"]["trapped"]
    card.data["additional_fields"] = {"details": {"blocked": True}}
    assert not compatible(card, plan)


async def test_only_explicit_owned_matching_examples_are_retrieved_and_edit_withdraws(
    teaching, db_client, db_session
):
    t = teaching
    card = await t.post("cards", t.card_payload)
    other = await t.post("cards", t.card_payload, actor="other")
    sms = await t.post(
        "cards",
        t.card_payload
        | {"data": t.card_payload["data"] | {"additional_fields": {"messageChannel": "sms"}}},
    )

    async def mark(c, *, enabled=True, actor="teacher", revision=1, expected=200):
        r = await db_client.put(
            f"/api/v1/cards/{c['id']}/generation-example",
            json={"enabled": enabled, "revision": revision},
            headers=t.headers[actor],
        )
        assert r.status_code == expected, r.text
        return r.json()

    await mark(card, actor="student", expected=403)
    await mark(card, actor="admin", expected=403)
    await mark(card, actor="other", expected=404)
    await mark(card, revision=2, expected=409)
    await mark(card, enabled="true", expected=422)
    await mark(other, actor="other")
    await mark(sms)
    data = sample("road-collision")
    data["card"]["classifier_entry_id"] = str(t.entry.id)
    job = SimpleNamespace(input=data, created_by_id=t.accounts["teacher"].id)
    assert not any(e["source"] == "teacher" for e in await retrieve(db_session, job))
    assert (await mark(card))["generation_example"]
    examples = await retrieve(db_session, job)
    assert [e["id"] for e in examples if e["source"] == "teacher"] == [card["id"]]
    await mark(card, enabled=False)
    assert not any(e["source"] == "teacher" for e in await retrieve(db_session, job))
    await mark(card)
    update = await db_client.put(
        f"/api/v1/cards/{card['id']}",
        headers=t.headers["teacher"],
        json=t.card_payload | {"revision": 1, "caller_message": "Другое условие происшествия"},
    )
    assert update.status_code == 200, update.text
    assert not update.json()["generation_example"]
    assert (await db_session.get(CardTemplate, UUID(card["id"]))).revision == 2
    await mark(card, expected=409)


async def test_used_card_can_be_approved_without_changing_its_snapshot(teaching, db_client):
    t = teaching
    setup = await t.prepare()
    r = await db_client.put(
        f"/api/v1/cards/{setup.first['id']}/generation-example",
        headers=t.headers["teacher"],
        json={"enabled": True, "revision": 1},
    )
    assert r.status_code == 200, r.text
    assert r.json()["generation_example"] and not r.json()["can_edit"]
    assert r.json()["revision"] == 1


async def test_worker_publishes_checked_prose_and_withdrawal_forces_disclosed_fallback(
    teaching, db_session, monkeypatch
):
    from test_card_generation import payload

    from app.schemas.generation import GenerationCreate
    from app.services.card_generation import enqueue
    from app.services.generation import llm
    from app.services.generation.prose import Narration, Review, source
    from app.services.generation_worker import claim, finish

    t = teaching
    t.entry.display_name = "ДТП"
    example = await t.post("cards", t.card_payload)
    stored = await db_session.get(CardTemplate, UUID(example["id"]))
    stored.generation_example = True
    await db_session.commit()
    await enqueue(
        db_session,
        t.accounts["teacher"].id,
        GenerationCreate.model_validate(payload(t, message_format="call")),
    )
    for revoked in (False, True):
        job = await claim(db_session)
        examples = await retrieve(db_session, job)
        assert examples[0]["source"] == "teacher"
        job.context = {**job.context, "generation_examples": examples}
        facts = source(job.input)[1]

        def request(model, prompt, schema, **kwargs):
            return (
                Narration(message=" ".join(facts))
                if schema is Narration
                else Review(covered=list(range(len(facts))), unsupported=[], contradictions=[])
            ), {}

        monkeypatch.setattr(llm, "request", request)
        text, metadata = llm.compose(job)
        assert metadata["source"] == "assisted"
        if revoked:
            stored.generation_example = False
            await db_session.commit()
        assert await finish(db_session, job.id, job.worker_id, text, metadata)
        await db_session.refresh(job)
        assert job.output["inference"]["source"] == ("template-fallback" if revoked else "assisted")
        card = await db_session.get(CardTemplate, job.card_template_id)
        assert card.caller_message and not card.generation_example
