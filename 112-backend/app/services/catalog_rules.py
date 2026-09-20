from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.catalog_document import FeatureDefinition


def feature_definitions(entry):
    if not entry.conditions:
        return []
    if (
        set(entry.conditions) != {"format", "features"}
        or entry.conditions["format"] != "boolean-features-v1"
    ):
        raise HTTPException(409, "Unsupported classifier condition format")
    try:
        return [FeatureDefinition.model_validate(f) for f in entry.conditions["features"]]
    except (ValidationError, TypeError) as exc:
        raise HTTPException(409, "Invalid classifier feature definitions") from exc


def applicable_routes(entry, routes, features):
    definitions = feature_definitions(entry)
    answers = (features or {}).get("ekp", {})
    if not isinstance(answers, dict):
        raise HTTPException(422, "Answer every classifier feature")
    keys = {f.key for f in definitions}
    if set(answers) - keys:
        raise HTTPException(422, "Unknown classifier feature")
    if any(type(answers.get(key)) is not bool for key in keys):
        raise HTTPException(422, "Answer every classifier feature")
    result = []
    for route in routes:
        if not route.conditions:
            result.append(route)
            continue
        if set(route.conditions) != {"when"} or not isinstance(route.conditions["when"], dict):
            raise HTTPException(409, "Unsupported classifier condition format")
        conditions = route.conditions["when"]
        if not set(conditions) <= keys or any(type(v) is not bool for v in conditions.values()):
            raise HTTPException(409, "Invalid classifier route conditions")
        if all(answers.get(key) is value for key, value in conditions.items()):
            result.append(route)
    return result
