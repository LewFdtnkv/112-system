"""Keep learner advice consistent with the rubric even when the model drifts."""

import re


def normalize_recommendation(criterion, decision):
    if criterion["code"] != "description" or decision.verdict not in ("incorrect", "partial"):
        return decision, {}
    numeric_answer = bool(re.fullmatch(r"[\d\s.,+\-]+", criterion.get("answer", "")))
    if not numeric_answer and not re.search(
        r"дословн|точн\w*\s+воспроизвед|точн\w*\s+(?:повтор|перепис)",
        decision.recommendation,
        re.I,
    ):
        return decision, {}
    return decision.model_copy(
        update={
            "recommendation": "Опишите происшествие своими словами, сохранив факты из условия. "
            "Не добавляйте неизвестных обстоятельств.",
        }
    ), {
        "recommendation_guard": {
            "reason": "Use narrative instead of a number; do not invent a field for that number"
            if numeric_answer
            else "Paraphrases are allowed by the rubric",
            "original": decision.recommendation,
        }
    }
