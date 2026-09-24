"""Idempotent authored RAG examples; no users, attempts or grades are changed."""

import argparse
import asyncio

from app.db.session import session_factory
from app.services.assessment_memory.library import seed
from app.services.assessment_memory.retrieval import index_pending


async def run(index):
    async with session_factory() as session:
        print(f"Added examples: {await seed(session)}", flush=True)
        if index:
            total = 0
            while count := await index_pending(session):
                total += count
                print(f"Indexed examples: {total}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", action="store_true")
    asyncio.run(run(parser.parse_args().index))
