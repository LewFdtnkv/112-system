from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.catalog_document import FeatureDefinition


def feature_definitions(entry):
    if not entry.conditions:
        return []
    if set(entry.conditions) != {"format", "features"} or entry.conditions["format"] not in (
        "boolean-features-v1",
        "typed-features-v1",
    ):
        raise HTTPException(409, "Unsupported classifier condition format")
    try:
        return [FeatureDefinition.model_validate(f) for f in entry.conditions["features"]]
    except (ValidationError, TypeError) as exc:
        raise HTTPException(409, "Invalid classifier feature definitions") from exc


def validate_answers(definitions, answers, *, require_complete=True):
    if not isinstance(answers, dict):
        raise HTTPException(422, "Invalid classifier answers")
    by_key = {f.key: f for f in definitions}
    if set(answers) - set(by_key):
        raise HTTPException(422, "Unknown classifier feature")
    for key, definition in by_key.items():
        if key not in answers:
            if require_complete and definition.required:
                raise HTTPException(422, f"Answer required feature: {definition.label}")
            continue
        if not definition.accepts(answers[key]):
            raise HTTPException(422, f"Invalid answer for feature: {definition.label}")
        if require_complete and definition.required and answers[key] == []:
            raise HTTPException(422, f"Answer required feature: {definition.label}")


def condition_matches(expected, actual):
    if isinstance(expected, list):
        return isinstance(actual, list) and set(expected) <= set(actual)
    return type(expected) is type(actual) and expected == actual


def applicable_routes(entry, routes, features):
    definitions = feature_definitions(entry)
    answers = (features or {}).get("ekp", {})
    validate_answers(definitions, answers)
    by_key = {f.key: f for f in definitions}
    result = []
    for route in routes:
        if not route.conditions:
            result.append(route)
            continue
        if set(route.conditions) != {"when"} or not isinstance(route.conditions["when"], dict):
            raise HTTPException(409, "Unsupported classifier condition format")
        conditions = route.conditions["when"]
        if any(
            k not in by_key or not by_key[k].accepts(v) or v == [] for k, v in conditions.items()
        ):
            raise HTTPException(409, "Invalid classifier route conditions")
        if all(
            key in answers and condition_matches(value, answers[key])
            for key, value in conditions.items()
        ):
            result.append(route)
    return result
