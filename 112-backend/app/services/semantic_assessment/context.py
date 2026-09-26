"""Freeze assessable fields and published service responsibilities at submission."""

import json
from uuid import UUID

from sqlalchemy import select

from app.models import ServiceProfile
from app.models.enums import PublicationStatus
from app.services.learning_scope import field_skill
from app.services.semantic_assessment.process import summarize_process
from app.services.semantic_assessment.prompts import PROMPT_VERSION as PROMPT_VERSION


def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


async def build_context(session, evaluation, check):
    snapshot = evaluation.context_snapshot
    source = snapshot["source"]
    actual = snapshot["card"]["data"]
    scope = snapshot.get("exercise_scope")
    situation = "\n\n".join(
        filter(None, [source.get("caller_message"), snapshot.get("instructions")])
    )
    criteria = []

    def add(code, label, reference, answer, kind="text", **extra):
        criteria.append(
            {
                "code": code,
                "label": label,
                "reference": reference or "",
                "answer": answer or "",
                "situation": situation,
                "kind": kind,
                **extra,
            }
        )

    if not snapshot.get("dds"):
        fields = {f.field: f for f in check.fields}
        for path in (
            "description",
            "address_text",
            "address_details.description",
        ):
            if scope is not None and field_skill(path) not in scope:
                continue
            field = fields.get(path)
            # A complete answer must preserve supplied facts, not merely an incomplete reference.
            if field or path == "description" and situation:
                add(
                    path,
                    field.label if field else "Смысл сообщения",
                    field.expected if field else "",
                    field.actual if field else actual.get(path),
                )

        # These ARM fields are optional. Assess what was written, never require their presence.
        def value(data, path):
            for part in path.split("."):
                data = (data or {}).get(part)
            return data or ""

        for path, label in (
            ("additional_fields.operatorAction", "Комментарий оператора"),
            ("additional_fields.details.classificationDescription", "Уточнение типа"),
        ):
            if (scope is None or field_skill(path) in scope) and value(actual, path).strip():
                add(
                    path,
                    label,
                    value(source.get("data", {}), path),
                    value(actual, path),
                    optional=True,
                )
        if scope is None or "notification" in scope:
            expected_ids = {r["service_id"] for r in source.get("recipients", [])}
            notified = snapshot["notified_services"]
            actual_ids = {r["service_id"] for r in notified}
            if expected_ids and expected_ids < actual_ids:
                extra_ids = actual_ids - expected_ids
                profiles = list(
                    await session.scalars(
                        select(ServiceProfile)
                        .where(
                            ServiceProfile.service_id.in_([UUID(i) for i in extra_ids]),
                            ServiceProfile.status == PublicationStatus.PUBLISHED,
                        )
                        .order_by(ServiceProfile.version.desc())
                    )
                )
                responsibilities = {}
                for profile in profiles:
                    responsibilities.setdefault(str(profile.service_id), profile.responsibility)
                extra = [r for r in notified if r["service_id"] in extra_ids]
                add(
                    "additional_services",
                    "Обоснованность дополнительных служб",
                    compact(source.get("recipients", [])),
                    compact(extra),
                    "services",
                    service_scope={
                        r["name"]: responsibilities.get(r["service_id"], "") for r in extra
                    },
                )
    else:
        situation = "\n".join(s["message"] for s in snapshot.get("dds_policy", {}).get("steps", []))
        # Comments are optional. Their absence never creates a criterion or a penalty.
        if scope is None or "dds_response" in scope:
            comments = [
                {"crew": c["name"], "status": h["status"], "comment": h["comment"]}
                for c in snapshot["dds"].get("crews", [])
                for h in c.get("history", [])
                if h.get("comment", "").strip()
            ]
            if comments:
                add(
                    "dds.comments",
                    "Согласованность комментариев бригад",
                    situation,
                    compact(comments),
                    "dds",
                    optional=True,
                )
    facts = {k: actual.get(k) for k in ("address_details", "features")}
    facts["flags"] = actual.get("additional_fields", {}).get("details", {})
    facts["other_text_fields"] = {
        "description": actual.get("description"),
        "operator_comment": actual.get("additional_fields", {}).get("operatorAction"),
    }
    return {
        "version": PROMPT_VERSION,
        "evaluation_id": str(evaluation.id),
        "context_hash": snapshot["context_hash"],
        "criteria": criteria,
        "submitted_facts": facts,
        "process": await summarize_process(
            session, evaluation.attempt_id, snapshot["audit_sequence"]
        ),
    }
