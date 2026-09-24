"""Deterministic limits: explicit conflicting sources and source-only quote choices."""

import re

from app.schemas.semantic_assessment import SemanticDecision


def explicitly_conflicting(situation):
    # Only explicit source ambiguity, not disagreement between student and reference.
    text = " ".join(situation.lower().split())
    return bool(
        re.search(
            r"(?<!не )противоречат друг другу|"
            r"(?:противоречивые|взаимоисключающие) (?:сведения|сообщения|показания)",
            text,
        )
    )


def quote_options(text):
    parts = [text] if len(text) <= 350 else []
    parts.extend(re.split(r"(?<=[.!?;])\s+|\n+", text))
    quotes = [""]
    for part in parts:
        # Long uninterrupted fields remain literal contiguous excerpts, never rewritten.
        for start in range(0, len(part), 350):
            quote = part[start : start + 350].strip()
            if quote and quote not in quotes:
                quotes.append(quote)
    return quotes


def response_schema(criterion):
    schema = SemanticDecision.model_json_schema()
    # Service evidence must describe the situation, not "the main service was notified".
    source = criterion["situation"] or criterion["reference"]
    schema["properties"]["reference_quote"]["enum"] = quote_options(source)
    schema["properties"]["answer_quote"]["enum"] = quote_options(criterion["answer"])
    return schema
