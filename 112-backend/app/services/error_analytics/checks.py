"""One effective observation per checked field; never infer an error from absent AI."""

from app.services.learning_scope import field_skill
from app.services.semantic_assessment.rule_review import field_adjustments


def skill_for(path):
    if path.startswith("dds.timing."):
        return "dds_timing"
    if path.startswith(("dds.assignment.", "dds.notification.")):
        return "dds_crews"
    if path.startswith("dds."):
        return "dds_response"
    return field_skill(path)


def observations(evaluation, criteria, job):
    findings = (job.output or {}).get("findings", []) if job and job.status == "succeeded" else []
    changes = field_adjustments(evaluation, job, findings)
    semantic_codes = {c["code"] for c in job.input.get("criteria", [])} if job else set()
    result = {}
    for criterion in criteria:
        for field in criterion.criterion_snapshot.get("fields", []):
            if not field.get("scored"):
                continue
            path = field["field"]
            # Presence alone cannot establish the quality of free text.
            if path in {"description", "address_text"} and path in semantic_codes:
                continue
            if path == "recipients" and "additional_services" in semantic_codes:
                continue
            credit = float(field["status"] == "matched")
            if path in changes and changes[path]["before"] == credit:
                credit = changes[path]["after"]
            result[path] = {
                "key": path,
                "label": field["label"],
                "skill": skill_for(path),
                "error": credit < 0.999,
            }
    rule_codes = (
        {c["code"] for c in job.input.get("criteria", []) if "rule_check" in c} if job else set()
    )
    for finding in findings:
        if not finding.get("applied") or finding["code"] in rule_codes:
            continue
        path = "recipients" if finding["code"] == "additional_services" else finding["code"]
        result[path] = {
            "key": path,
            "label": finding["label"],
            "skill": skill_for(path),
            "error": float(finding["credit"]) < 0.999,
        }
    return list(result.values())
