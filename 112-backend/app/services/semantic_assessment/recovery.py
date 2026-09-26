"""Resume completed criteria only for the exact model, prompt and frozen evidence."""

import hashlib
import json
import urllib.error

from pydantic import ValidationError

from app.schemas.semantic_assessment import SemanticFinding
from app.services.semantic_assessment.prompts import PROMPT_VERSION


class AssessmentFailure(RuntimeError):
    def __init__(self, cause, diagnostic, checkpoint):
        super().__init__("Semantic assessment interrupted")
        self.diagnostic = {
            **diagnostic,
            "error_type": type(cause).__name__,
            **failure_details(cause),
        }
        self.checkpoint = checkpoint


def failure_details(error):
    if isinstance(error, TimeoutError) or (
        isinstance(error, urllib.error.URLError) and isinstance(error.reason, TimeoutError)
    ):
        return {"category": "timeout"}
    if isinstance(error, urllib.error.HTTPError):
        return {"category": "http", "http_status": error.code}
    if isinstance(error, OSError):
        return {"category": "connection"}
    if isinstance(error, ValidationError):
        return {
            "category": "response_schema",
            "invalid_fields": [
                {"path": list(item["loc"]), "type": item["type"]}
                for item in error.errors(
                    include_url=False, include_input=False, include_context=False
                )[:10]
            ],
        }
    if isinstance(error, json.JSONDecodeError):
        return {"category": "invalid_json"}
    controlled = {
        "Semantic context exceeds the tested context budget": "context_budget",
        "Oversized semantic response": "response_size",
        "Incomplete semantic response": "incomplete_response",
        "Insufficient context reserve for semantic evidence": "context_reserve",
    }
    return {"category": controlled.get(str(error), "internal")}


def fingerprint(job):
    payload = {
        "prompt": PROMPT_VERSION,
        "model": job.model_version,
        "input": job.input,
        "retrieval": getattr(job, "context", {}).get("retrieval", {}),
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def restore(job, signature):
    saved = getattr(job, "context", {}).get("assessment_checkpoint", {})
    if saved.get("signature") != signature:
        return [], []
    try:
        findings = [SemanticFinding.model_validate(item) for item in saved["findings"]]
        codes = [item["code"] for item in job.input["criteria"]]
        if [item.code for item in findings] != codes[: len(findings)]:
            return [], []
        return findings, list(saved["trace"])
    except (KeyError, TypeError, ValueError):
        return [], []
