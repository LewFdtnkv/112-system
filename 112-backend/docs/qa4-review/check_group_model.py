"""Opt-in synthetic QA4 group check; uses a separate database, never student grades."""

import asyncio
import json
import time
from types import SimpleNamespace

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.services.learning_recommendations.inference import evaluate
from app.services.learning_recommendations.materials import retrieve


async def main():
    engine = create_async_engine(str(settings.database_url))
    profile = {
        "group": True,
        "candidates": ["dds_response", "dds_crews"],
        "skills": {
            "dds_response": {"signal": "practice", "checked_cards": 16, "failed_cards": 4},
            "dds_crews": {"signal": "practice", "checked_cards": 16, "failed_cards": 2},
        },
    }
    async with async_sessionmaker(engine)() as session:
        bundle = await retrieve(session, profile)
        await session.commit()
    job = SimpleNamespace(
        input={"profile": profile}, context={"materials": bundle}, model_version=settings.llm_model
    )
    started = time.monotonic()
    output = await asyncio.to_thread(evaluate, job)
    output["seconds"] = round(time.monotonic() - started, 2)
    output["retrieval"] = bundle["status"]
    output["recommendations"] = [m for m in bundle["examples"] if m["id"] in output["selected_ids"]]
    print(json.dumps(output, ensure_ascii=False, indent=2))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
