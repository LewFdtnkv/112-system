"""Read-only critic calibration against three deliberate errors and one valid paraphrase."""

import json
import time

from app.core.config import settings
from app.services.generation.llm import request
from app.services.generation.prose import (
    Review,
    review_prompt,
    source,
    validate_message,
    validate_review,
)
from scripts.evaluate_generation import sample


def main():
    cases = []
    d = sample("gas-stove")
    cases.append(
        (
            "copied-fire-instead-of-gas",
            d,
            "У нас во дворе загорелась куча мусора. Прямо пламя видно и дым идёт. "
            "Это [АДРЕС]. Меня зовут [ИМЯ].",
            False,
        )
    )
    d = sample("medical-faint")
    cases.append(
        ("breathing-negated", d, " ".join(source(d)[1]).replace("но дышит", "не дышит"), False)
    )
    d = sample("road-collision", parameters={"has_victims": True, "victims_count": 2})
    cases.append(
        (
            "wrong-victim-count",
            d,
            " ".join(source(d)[1]).replace("Пострадали два человека.", "Пострадали три человека."),
            False,
        )
    )
    d = sample("gas-stove")
    cases.append(
        (
            "correct-paraphrase",
            d,
            " ".join(source(d)[1])
            .replace(
                "В помещении пахнет газом рядом с плитой.",
                "Внутри около плиты чувствую запах газа.",
            )
            .replace("Доступ к месту происшествия свободен.", "Подойти сюда можно."),
            True,
        )
    )
    for name, data, message, expected in cases:
        start = time.monotonic()
        review = None
        error = None
        metrics = None
        try:
            validate_message(data, message)
            review, metrics = request(
                settings.llm_model,
                review_prompt(data, message),
                Review,
                seed=910,
                temperature=0,
                timeout=300,
            )
            validate_review(data, message, review)
            accepted = True
        except (ValueError, OSError) as e:
            accepted = False
            error = str(e)
        print(
            json.dumps(
                {
                    "case": name,
                    "expected_accept": expected,
                    "accepted": accepted,
                    "seconds": round(time.monotonic() - start, 2),
                    "input": data,
                    "message": message,
                    "review": review.model_dump() if review else None,
                    "metrics": metrics,
                    "error": error,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
