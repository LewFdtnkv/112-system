"""Exact pgvector search plus Russian lexical ranking, always scope-filtered."""

import asyncio
from datetime import UTC, datetime

from sqlalchemy import func, or_, select

from app.models import AssessmentExample, AssessmentMemoryPreference
from app.services.assessment_memory.embeddings import embed, identity

POLICY_VERSION = "semantic-v1"


def search_text(criterion, reason=""):
    return "\n".join(
        filter(
            None,
            [
                criterion["situation"],
                criterion["answer"],
                " ".join(criterion.get("service_scope", {}).values()),
                reason,
            ],
        )
    )


def example_snapshot(row):
    return {
        "id": str(row.id),
        "source_key": row.source_key,
        "policy_version": row.policy_version,
        "condition": row.situation,
        "answer": row.answer,
        "verdict": row.verdict,
        "reason": row.reason,
    }


async def index_pending(session, limit=16):
    model_id = await asyncio.to_thread(identity)
    rows = list(
        await session.scalars(
            select(AssessmentExample)
            .where(
                AssessmentExample.active.is_(True),
                or_(
                    AssessmentExample.embedding.is_(None),
                    AssessmentExample.embedding_model != model_id,
                ),
            )
            .order_by(AssessmentExample.created_at, AssessmentExample.id)
            .limit(limit)
        )
    )
    if not rows:
        return 0
    vectors, actual_id = await asyncio.to_thread(embed, [r.search_text for r in rows])
    if actual_id != model_id:
        raise ValueError("Embedding model identity changed")
    for row, vector in zip(rows, vectors, strict=True):
        row.embedding, row.embedding_model, row.embedded_at = vector, model_id, datetime.now(UTC)
    await session.commit()
    return len(rows)


async def retrieve(session, criterion, vector, model_id, *, teacher_id=None, source_job_id=None):
    role = "dds" if criterion["kind"] == "dds" else "operator_112"
    scope = [
        AssessmentExample.active.is_(True),
        AssessmentExample.policy_version == POLICY_VERSION,
        AssessmentExample.role == role,
        AssessmentExample.kind == criterion["kind"],
        AssessmentExample.criterion_code == criterion["code"],
        AssessmentExample.embedding_model == model_id,
        AssessmentExample.embedding.is_not(None),
        or_(
            AssessmentExample.created_by_id.is_(None), AssessmentExample.created_by_id == teacher_id
        ),
    ]
    if teacher_id:
        scope.append(
            ~select(AssessmentMemoryPreference.example_id)
            .where(
                AssessmentMemoryPreference.teacher_id == teacher_id,
                AssessmentMemoryPreference.example_id == AssessmentExample.id,
                or_(
                    AssessmentMemoryPreference.disabled.is_(True),
                    AssessmentMemoryPreference.removed.is_(True),
                ),
            )
            .exists()
        )
    if source_job_id:
        scope.append(
            or_(
                AssessmentExample.source_job_id.is_(None),
                AssessmentExample.source_job_id != source_job_id,
            )
        )
    distance = AssessmentExample.embedding.cosine_distance(vector)
    semantic = list(
        (
            await session.execute(
                select(AssessmentExample, distance.label("distance"))
                .where(
                    *scope,
                    distance <= 0.65,
                )
                .order_by(distance, AssessmentExample.id)
                .limit(20)
            )
        ).all()
    )
    if not semantic:
        return []
    ids = [r.id for r, _ in semantic]
    query = func.plainto_tsquery("russian", search_text(criterion))
    rank = func.ts_rank_cd(func.to_tsvector("russian", AssessmentExample.search_text), query)
    # Lexical ranking cannot introduce a row rejected by semantic/scope filters.
    lexical = list(
        await session.scalars(
            select(AssessmentExample.id)
            .where(
                AssessmentExample.id.in_(ids),
                rank > 0,
            )
            .order_by(rank.desc(), AssessmentExample.id)
        )
    )
    scores = {r.id: 1 / (60 + i) for i, (r, _) in enumerate(semantic, 1)}
    for i, row_id in enumerate(lexical, 1):
        scores[row_id] += 1 / (60 + i)
    ordered = sorted(semantic, key=lambda item: (-scores[item[0].id], str(item[0].id)))
    return [
        example_snapshot(row) | {"similarity": round(1 - float(d), 5)} for row, d in ordered[:3]
    ]


async def retrieve_batch(session, criteria, *, teacher_id=None, source_job_id=None):
    vectors, model_id = await asyncio.to_thread(
        embed, [search_text(c) for c in criteria], query=True
    )
    results = {}
    for criterion, vector in zip(criteria, vectors, strict=True):
        results[criterion["code"]] = await retrieve(
            session,
            criterion,
            vector,
            model_id,
            teacher_id=teacher_id,
            source_job_id=source_job_id,
        )
    return {"status": "ready", "embedding_model": model_id, "examples": results}
