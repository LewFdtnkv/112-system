"""Bounded Ollama calls and conservative acceptance of semantic decisions."""

import hashlib
import json
import urllib.request

from app.core.config import settings
from app.schemas.semantic_assessment import SemanticDecision, SemanticFinding
from app.services.semantic_assessment.evidence import explicitly_conflicting, response_schema
from app.services.semantic_assessment.prompts import messages

CREDIT = {"correct": 1.0, "partial": 0.5, "incorrect": 0.0}


def call(criterion, facts, model, verification=False):
    prompt = messages(criterion, facts, verification)
    # Do not silently truncate a condition/evidence or allow the runtime to discard it.
    if sum(len(m["content"]) for m in prompt) > 8000:
        raise ValueError("Semantic context exceeds the tested context budget")
    request = urllib.request.Request(
        settings.llm_base_url.rstrip("/") + "/api/chat",
        data=json.dumps(
            {
                "model": model,
                "stream": False,
                "think": False,
                "keep_alive": "60s",
                "format": response_schema(criterion),
                "messages": prompt,
                "options": {
                    "num_ctx": 4096,
                    "num_predict": 650,
                    "temperature": 0.1,
                    "seed": 113 if verification else 112,
                },
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=settings.llm_timeout_seconds) as response:
        raw = response.read(32769)
    if len(raw) > 32768:
        raise ValueError("Oversized semantic response")
    result = json.loads(raw)
    if not result.get("done") or result.get("done_reason") == "length":
        raise ValueError("Incomplete semantic response")
    if result.get("prompt_eval_count", 0) > 3400:
        raise ValueError("Insufficient context reserve for semantic evidence")
    decision = SemanticDecision.model_validate_json(result["message"]["content"])
    metrics = {
        k: result.get(k)
        for k in (
            "model",
            "total_duration",
            "load_duration",
            "prompt_eval_count",
            "eval_count",
        )
    }
    return decision, {**metrics, "messages": prompt, "response_schema": response_schema(criterion)}


def supported(decision, criterion):
    reference = criterion["situation"] + "\n" + criterion["reference"]
    return (
        decision.verdict != "uncertain"
        and decision.confidence >= 0.85
        and len(decision.reference_quote.strip()) >= 4
        and decision.reference_quote in reference
        and bool(decision.answer_quote.strip())
        and decision.answer_quote in criterion["answer"]
    )


def evaluate(job, invoke=call):
    results, trace = [], []
    process = job.input.get("process", {})
    facts = job.input["submitted_facts"] | {
        "learning_process": {
            "confirmed_actions": process.get("confirmed_actions", {}),
            "parallel_activity": process.get("parallel_summary"),
            "saved_field_changes": process.get("saved_field_changes", {}),
            "hints": [{"task": h["task"], "level": h["level"]} for h in process.get("hints", [])],
            "penalty": "none",
            "browser_coverage": "incomplete_or_unknown",
        }
    }
    retrieval = getattr(job, "context", {}).get("retrieval", {})
    used = {}
    for original in job.input["criteria"]:
        examples = list(retrieval.get("examples", {}).get(original["code"], []))
        criterion = original | {"_retrieved_examples": examples}
        while examples and sum(len(m["content"]) for m in messages(criterion, facts, True)) > 8000:
            examples.pop()
        used[criterion["code"]] = [e["id"] for e in examples]
        base = {"code": criterion["code"], "label": criterion["label"]}
        if explicitly_conflicting(criterion["situation"]) or explicitly_conflicting(
            criterion["reference"]
        ):
            used[criterion["code"]] = []
            results.append(
                SemanticFinding(
                    **base,
                    verdict="uncertain",
                    reason=(
                        "В условии прямо указано противоречие между источниками. "
                        "Автоматический смысловой штраф запрещён."
                    ),
                    recommendation=(
                        "Преподавателю следует уточнить условие и проверить ответ вручную."
                    ),
                )
            )
            trace.append({"code": criterion["code"], "guard": "explicit_source_conflict"})
            continue
        if sum(len(m["content"]) for m in messages(criterion, facts, True)) > 8000:
            results.append(
                SemanticFinding(
                    **base,
                    verdict="uncertain",
                    reason="Объём сведений превышает проверенный контекст небольшой модели.",
                    recommendation="Преподавателю следует проверить этот критерий.",
                )
            )
            continue
        if not criterion["answer"].strip():
            results.append(
                SemanticFinding(
                    **base,
                    verdict="incorrect",
                    credit=0,
                    applied=True,
                    reason="Поле с заданными в условии сведениями не заполнено.",
                    recommendation="Зафиксируйте доступные сведения из условия.",
                )
            )
            continue
        if criterion["kind"] == "services" and (
            not criterion.get("service_scope") or not all(criterion["service_scope"].values())
        ):
            results.append(
                SemanticFinding(
                    **base,
                    verdict="uncertain",
                    reason="Для дополнительной службы нет опубликованного описания компетенции.",
                    recommendation="Преподавателю следует проверить обоснованность службы.",
                )
            )
            continue
        first, metrics = invoke(criterion, facts, job.model_version)
        trace.append(
            {
                "code": criterion["code"],
                "pass": 1,
                "decision": first.model_dump(),
                "metrics": metrics,
            }
        )
        accepted = supported(first, criterion)
        if accepted:
            second, metrics = invoke(criterion, facts, job.model_version, True)
            trace.append(
                {
                    "code": criterion["code"],
                    "pass": 2,
                    "decision": second.model_dump(),
                    "metrics": metrics,
                }
            )
            accepted = supported(second, criterion) and first.verdict == second.verdict
        results.append(
            SemanticFinding(
                **base,
                verdict=first.verdict if accepted else "uncertain",
                credit=CREDIT.get(first.verdict) if accepted else None,
                applied=accepted,
                reason=first.reason
                if accepted
                else "Надёжность смыслового решения не подтверждена: " + first.reason,
                recommendation=first.recommendation,
                reference_quote=first.reference_quote,
                answer_quote=first.answer_quote,
            )
        )
    return {
        "findings": [r.model_dump() for r in results],
        "trace": trace,
        "retrieval": {
            "status": retrieval.get("status", "disabled"),
            "embedding_model": retrieval.get("embedding_model"),
            "snapshot_hash": hashlib.sha256(
                json.dumps(retrieval, sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest(),
            "used_examples": used,
        },
    }
