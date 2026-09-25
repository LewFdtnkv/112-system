"""Numeric boundaries shared by HTTP schemas and JSON validation."""

import math
from typing import Annotated

from pydantic import AfterValidator, JsonValue

INT32_MAX = 2**31 - 1
INT64_MAX = 2**63 - 1
JS_SAFE_INTEGER = 2**53 - 1


def invalid_json_number(value, *, bounded=False):
    stack = [((), value)]
    while stack:
        path, item = stack.pop()
        if isinstance(item, float) and not math.isfinite(item):
            return path, "JSON numbers must be finite"
        if bounded and type(item) in (int, float) and abs(item) > JS_SAFE_INTEGER:
            return path, "JSON number exceeds the supported browser-safe range"
        if isinstance(item, dict):
            stack.extend(((*path, key), child) for key, child in item.items())
        elif isinstance(item, list):
            stack.extend(((*path, index), child) for index, child in enumerate(item))
    return None


def browser_json(value):
    if error := invalid_json_number(value, bounded=True):
        raise ValueError(error[1])
    return value


SafeJsonValue = Annotated[JsonValue, AfterValidator(browser_json)]


def browser_model_numbers(value):
    browser_json(value.model_dump())
    return value
