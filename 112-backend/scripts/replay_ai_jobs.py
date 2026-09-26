"""Replay frozen stand jobs in memory; never claim jobs or publish cards/grades.

Run against a stand only with permission to inspect its learner data. The report
contains those texts and must be handled like the original protected job details.
"""

import argparse
import asyncio
import copy
import json
import time
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import select

from app.core.config import settings
from app.db.session import session_factory
from app.models import AIJob
from app.models.enums import AIPurpose
from app.services.generation.llm import compose
from app.services.generation.prose import VERSION, generation_prompt
from app.services.generation.protection import protect
from app.services.semantic_assessment.inference import evaluate
from app.services.semantic_assessment.prompts import PROMPT_VERSION


async def snapshots(purpose, ids):
    async with session_factory() as session:
        statement = (
            select(AIJob)
            .where(AIJob.purpose == AIPurpose(purpose))
            .order_by(AIJob.created_at.desc())
        )
        rows = list(await session.scalars(statement))
        return [
            SimpleNamespace(
                id=str(row.id),
                input=copy.deepcopy(row.input),
                context=copy.deepcopy(row.context),
                model_version=row.model_version,
                previous={"status": row.status.value, "output": copy.deepcopy(row.output)},
            )
            for row in rows
            if not ids or str(row.id) in ids
        ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--purpose", choices=["generation", "evaluation"], required=True)
    parser.add_argument("--id", action="append")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    jobs = asyncio.run(snapshots(args.purpose, args.id))
    report = {
        "purpose": args.purpose,
        "version": VERSION if args.purpose == "generation" else PROMPT_VERSION,
        "threads": settings.llm_threads,
        "read_only": True,
        "cases": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for job in jobs:
        started = time.monotonic()
        row = {
            "id": job.id,
            "model": job.model_version,
            "input": job.input,
            "previous": job.previous,
        }
        try:
            if args.purpose == "generation":
                text, metadata = protect(job.input, *compose(job))
                row.update(
                    text=text.model_dump(), metadata=metadata, prompt=generation_prompt(job.input)
                )
            else:
                row["output"] = evaluate(job)
        except Exception as error:
            row["error_type"] = type(error).__name__
            row["diagnostic"] = getattr(error, "diagnostic", {})
            row["checkpoint"] = getattr(error, "checkpoint", {})
        row["seconds"] = round(time.monotonic() - started, 2)
        report["cases"].append(row)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "id": job.id,
                    "seconds": row["seconds"],
                    "error": row.get("error_type"),
                    "source": row.get("metadata", {}).get("source"),
                    "findings": row.get("output", {}).get("findings"),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
