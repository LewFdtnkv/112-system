"""Bounded field corrections; the model never chooses points or invents actions."""

from decimal import ROUND_HALF_UP, Decimal

VERSION = "rule-review-v1"
STEP = Decimal("0.25")


def eligible(path):
    return path in {"classifier_entry_id", "caller_name", "caller_phone"} or path.startswith(
        ("address_details.", "features.ekp.", "additional_fields.details.")
    )


def adjustment(criterion, finding):
    rule = criterion["rule_check"]
    before = Decimal(rule["credit"])
    after = before
    if finding["applied"] and finding["credit"] is not None:
        target = Decimal(str(finding["credit"]))
        # A missing required entry cannot be supplied by the model on the pupil's behalf.
        if target > before and rule["status"] != "missing":
            after = min(Decimal(1), before + STEP)
        elif target < before:
            after = max(Decimal(0), before - STEP)
    return {
        "field": rule["field"],
        "before": float(before),
        "after": float(after),
        "action": "increase" if after > before else "decrease" if after < before else "keep",
    }


def annotate(context, findings):
    """Derive public arithmetic from frozen server data, never from worker-supplied points."""
    by_code = {c["code"]: c for c in context.get("criteria", [])}
    for finding in findings:
        finding.pop("rule_adjustment", None)
        criterion = by_code.get(finding["code"], {})
        if context.get("rule_review_policy") == VERSION and "rule_check" in criterion:
            finding["rule_adjustment"] = adjustment(criterion, finding)
    return findings


def field_adjustments(evaluation, job, findings):
    """One trusted correction per field, shared by grades and learning recommendations."""
    context = getattr(job, "input", {}) if job else {}
    if (
        getattr(evaluation, "context_snapshot", {}).get("rule_review_policy") != VERSION
        or context.get("rule_review_policy") != VERSION
        or getattr(job, "status", None) != "succeeded"
    ):
        return {}
    by_code = {f["code"]: f for f in findings}
    return {
        c["rule_check"]["field"]: adjustment(c, by_code[c["code"]])
        for c in context.get("criteria", [])
        if "rule_check" in c and c["code"] in by_code
    }


def apply(evaluation, criteria, job, findings, adjustments):
    """Replace only the reviewed fact's share of its original weighted group."""
    reviewed = field_adjustments(evaluation, job, findings)
    if not reviewed:
        return Decimal(0)
    delta = Decimal(0)
    for group in criteria:
        fields = group.criterion_snapshot["fields"]
        changes = []
        credits = []
        for field in fields:
            before = Decimal(int(field["status"] == "matched"))
            credit = before
            if field["field"] in reviewed and field.get("scored", False):
                change = reviewed[field["field"]]
                # Protect against a mismatched/stale field projection.
                if change["before"] == before:
                    credit = Decimal(str(change["after"]))
                    if credit != before:
                        changes.append(
                            f"{field['label']}: {int(before * 100)} → {int(credit * 100)}%"
                        )
            credits.append(credit)
        if changes:
            awarded = (group.max_score * sum(credits) / len(fields)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            delta += awarded - group.score
            item = next(c for c in adjustments if c["code"] == group.code)
            item["score"] = float(awarded)
            item["explanation"] += " Пересмотр ИИ: " + "; ".join(changes) + "."
    return delta
