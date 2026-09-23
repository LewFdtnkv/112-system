"""Read-only model evaluation. Run in Docker; writes JSONL to stdout, no database changes."""

import argparse
import json
import random
import time
from pathlib import Path
from types import SimpleNamespace

from app.core.config import settings
from app.schemas.generation import GenerationParameters
from app.services.catalog_rules import feature_definitions
from app.services.generation.evidence import extra_evidence
from app.services.generation.library import for_entry
from app.services.generation.llm import compose
from app.services.generation.planner import build
from app.services.generation_flags import facts as flag_facts


def sample(template_id, *, seed=20260923):
    catalog = json.loads((Path(__file__).parent / "data/system112_catalog.json").read_text())
    for row in catalog["entries"]:
        entry = SimpleNamespace(
            name=row["name"],
            display_name=row["display_name"],
            conditions={
                "format": "typed-features-v1",
                "features": row["features"],
            },
        )
        for template in for_entry(entry):
            if template.id != template_id:
                continue
            p = GenerationParameters(
                no_contact=False,
                has_victims=template.has_victims or False,
                blocked=False,
                call_dropped=False,
                refused_ambulance=False,
            )
            rng = random.Random(seed)
            plan = build(entry, template, p, rng)
            plan.update(mode="assisted", default_wording={"wording": 0, "opening": 0, "order": 0})
            plan["extra_evidence"] = extra_evidence(
                feature_definitions(entry), plan["answers"], plan
            )
            facts = {
                "Адрес": "Москва, Лесная улица, д. 12" if not plan["service_call"] else "",
                "ФИО заявителя": "Анна Иванова",
                "Пол": "Женский",
                "Возраст": 34,
                "Состояние заявителя": "Взволнован",
                "Время суток": "Вечер",
                "Тип происшествия": row["name"],
                "Объект": plan["object"],
                "Признаки": plan["answers"],
                "Отметки карточки": flag_facts(plan["flags"], plan["victims_count"]),
            }
            if plan["service_call"]:
                facts.update({"ФИО заявителя": None, "Пол": None, "Возраст": None})
            return {
                "facts": facts,
                "narrative": plan,
                "seed": seed,
                "card": {
                    "data": {
                        "caller_phone": "+7 (000) 000-12-34",
                    }
                },
            }
    raise ValueError("Unknown template: " + template_id)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--templates",
        nargs="+",
        default=[
            "fire-rubbish",
            "road-collision",
            "gas-stove",
            "medical-faint",
            "wrong-number",
        ],
    )
    parser.add_argument("--without-model", action="store_true")
    args = parser.parse_args()
    for template_id in args.templates:
        data = sample(template_id)
        if args.without_model:
            data["narrative"]["mode"] = "template"
        job = SimpleNamespace(input=data, model_version=settings.llm_model)
        start = time.monotonic()
        text, metadata = compose(job)
        print(
            json.dumps(
                {
                    "template": template_id,
                    "seconds": round(time.monotonic() - start, 2),
                    "facts": data["facts"],
                    "text": text.model_dump(),
                    "metadata": metadata,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
