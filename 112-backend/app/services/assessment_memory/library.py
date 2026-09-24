"""Authored synthetic calibration examples, not customer-approved professional policy."""

import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.dialects.postgresql import insert

from app.models import AssessmentExample
from app.services.assessment_memory.retrieval import POLICY_VERSION, search_text


def load_examples():
    return json.loads((Path(__file__).parents[2] / "data/assessment_examples.json").read_text())


async def seed(session):
    count = 0
    for item in load_examples():
        criterion = item["criterion"]
        key = "bootstrap-v1:" + item["key"]
        result = await session.execute(
            insert(AssessmentExample)
            .values(
                id=uuid5(NAMESPACE_URL, "system112:assessment-example:" + key),
                source_key=key,
                kind=criterion["kind"],
                role="dds" if criterion["kind"] == "dds" else "operator_112",
                criterion_code=criterion["code"],
                policy_version=POLICY_VERSION,
                situation=criterion["situation"],
                reference=criterion.get("reference", ""),
                answer=criterion["answer"],
                verdict=item["verdict"],
                reason=item["reason"],
                search_text=search_text(criterion, item["reason"]),
                active=True,
            )
            .on_conflict_do_nothing(index_elements=[AssessmentExample.source_key])
        )
        count += result.rowcount
    await session.commit()
    return count
