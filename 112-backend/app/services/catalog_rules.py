from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.catalog_document import FeatureDefinition, validate_feature_dependencies


def feature_definitions(entry):
    if not entry.conditions:
        return []
    if set(entry.conditions) != {"format", "features"} or entry.conditions["format"] not in (
        "boolean-features-v1",
        "typed-features-v1",
    ):
        raise HTTPException(409, "Unsupported classifier condition format")
    try:
        definitions = [FeatureDefinition.model_validate(f) for f in entry.conditions["features"]]
        validate_feature_dependencies(definitions)
        return definitions
    except (ValidationError, TypeError, ValueError) as exc:
        raise HTTPException(409, "Invalid classifier feature definitions") from exc


def feature_is_visible(definition, active_answers):
    return not definition.visible_when or any(
        all(
            key in active_answers and condition_matches(value, active_answers[key])
            for key, value in group.items()
        )
        for group in definition.visible_when
    )


def active_features(definitions, answers):
    result, active_answers = [], {}
    for definition in definitions:
        if feature_is_visible(definition, active_answers):
            result.append(definition)
            if definition.key in answers:
                active_answers[definition.key] = answers[definition.key]
    return result


def validate_answers(definitions, answers, *, require_complete=True):
    if not isinstance(answers, dict):
        raise HTTPException(422, "Invalid classifier answers")
    by_key = {f.key: f for f in definitions}
    if set(answers) - set(by_key):
        raise HTTPException(422, "Unknown classifier feature")
    active = active_features(definitions, answers)
    if set(answers) - {f.key for f in active}:
        raise HTTPException(422, "Answers for hidden classifier fields are not allowed")
    for definition in active:
        key = definition.key
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
