"""Paired assessment comparison on frozen, excluded historical cases."""

import argparse
import asyncio
import json
import time
from pathlib import Path
from types import SimpleNamespace

from app.core.config import settings
from app.db.session import session_factory
from app.services.assessment_memory.library import load_examples, seed
from app.services.assessment_memory.retrieval import index_pending, retrieve_batch
from app.services.semantic_assessment.inference import call, evaluate


async def prepare(cases):
    async with session_factory() as session:
        await seed(session)
        while await index_pending(session):
            pass
        bundles = []
        for case in cases:
            bundles.append(await retrieve_batch(session, [case["criterion"]]))
        return bundles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=settings.assessment_model or settings.llm_model)
    parser.add_argument("--mode", choices=("both", "baseline", "rag"), default="both")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Retry only incomplete/failed pairs; keep prior failures",
    )
    args = parser.parse_args()
    cases = json.loads(args.cases_file.read_text())
    corpus = load_examples()
    for case in cases:
        assert all(case["criterion"]["situation"] != e["criterion"]["situation"] for e in corpus)
        assert all(
            case["criterion"]["answer"] != e["criterion"]["answer"]
            for e in corpus
            if case["criterion"]["kind"] != "services"
        )
    if args.resume:
        report = json.loads(args.output.read_text())
        if report["model"] != args.model or report["cases"] != cases:
            parser.error("Resume requires the same model and frozen cases")
        for run in report["results"]:
            if "result" not in run and "error" not in run:
                run["error"] = "Interrupted"
        bundles = report["retrieval"]
    else:
        started = time.monotonic()
        bundles = asyncio.run(prepare(cases))
        report = {
            "model": args.model,
            "cases": cases,
            "retrieval": bundles,
            "preparation_seconds": time.monotonic() - started,
            "results": [],
        }

    def save():
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    save()
    for case, bundle in zip(cases, bundles, strict=True):
        for mode in ("baseline", "rag"):
            if args.mode != "both" and mode != args.mode:
                continue
            prior = [
                r for r in report["results"] if r["case"] == case["case"] and r["mode"] == mode
            ]
            if args.resume and any("result" in r for r in prior):
                continue
            run = {
                "case": case["case"],
                "mode": mode,
                "expected": case["expected"],
                "completed_calls": [],
                "technical_retry": len(prior),
                "timeout_seconds": settings.llm_timeout_seconds,
            }
            report["results"].append(run)
            start = time.monotonic()

            def recorded(*params):
                decision, metrics = call(*params)
                run["completed_calls"].append(
                    {"decision": decision.model_dump(), "metrics": metrics}
                )
                save()
                return decision, metrics

            job = SimpleNamespace(
                model_version=args.model,
                context={"retrieval": bundle} if mode == "rag" else {},
                input={
                    "criteria": [case["criterion"]],
                    "submitted_facts": case.get("submitted_facts", {}),
                    "process": case.get("process", {}),
                },
            )
            try:
                run["result"] = evaluate(job, invoke=recorded)
            except Exception as error:
                run["error"] = type(error).__name__
            run["seconds"] = round(time.monotonic() - start, 2)
            save()
            print(
                json.dumps(
                    {k: v for k, v in run.items() if k not in ("completed_calls", "result")},
                    ensure_ascii=False,
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
