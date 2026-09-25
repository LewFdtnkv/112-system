"""Recheck the exact generated result before publishing a card."""

from app.services.generation.narration import fallback, render
from app.services.generation.prose import validate_publication


def protect(job_input, text, metadata):
    """Revalidate at publication too: callers cannot bypass guards by calling finish directly."""
    try:
        if metadata.get("source") == "assisted" and metadata.get("prose_version"):
            validate_publication(job_input, text, metadata)
            return text, metadata
        expected = render(job_input, metadata["selection"])
        if text != expected:
            raise ValueError("Text was changed after composition")
        return text, metadata
    except (ValueError, KeyError, TypeError):
        return fallback(job_input), {
            **metadata,
            "source": "template-fallback",
            "quality_note": "Использован текст заготовки: результат модели не прошёл проверку.",
        }
