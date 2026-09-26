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
from app.services.generation.presentation import prepare_message, resolve_address, resolve_caller
from app.services.generation.prose import generation_prompt
from app.services.generation.protection import protect
from app.services.generation_flags import facts as flag_facts


def sample(template_id, *, seed=20260923, parameters=None, facts_override=None):
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
            defaults = {
                "message_format": "call",
                "has_victims": template.has_victims or False,
                "blocked": False,
                "refused_ambulance": False,
            }
            params = parameters or {}
            if not template.service_call:
                defaults.update(locality="Москва", street="Лесная улица")
                if params.get("address_format") != "descriptive" and not params.get(
                    "address_description"
                ):
                    defaults["house"] = "12"
            if (
                not template.service_call
                and params.get("message_format") != "sms"
                and params.get("caller_information") not in ("anonymous", "name_only")
            ):
                defaults.update(
                    caller_information="full", caller_name="Анна Иванова", gender="female", age=34
                )
            p = GenerationParameters.model_validate(defaults | params)
            rng = random.Random(seed)
            plan = build(entry, template, p, rng)
            prepare_message(plan, p, feature_definitions(entry), rng)
            address, address_text = resolve_address(p, plan, rng)
            name, gender, age, phone = resolve_caller(p, plan, rng)
            plan.update(mode="assisted", default_wording={"wording": 0, "opening": 0, "order": 0})
            plan["extra_evidence"] = extra_evidence(
                feature_definitions(entry), plan["answers"], plan
            )
            facts = {
                "Адрес": address_text,
                "ФИО заявителя": name,
                "Пол": gender,
                "Возраст": age,
                "Состояние заявителя": "Взволнован",
                "Тип происшествия": row["name"],
                "Объект": plan["object"],
                "Признаки": plan["answers"],
                "Отметки карточки": flag_facts(plan["flags"], plan["victims_count"]),
            }
            facts.update(facts_override or {})
            return {
                "facts": facts,
                "narrative": plan,
                "seed": seed,
                "card": {
                    "data": {
                        "caller_phone": None,
                        "caller_details": {"callerId": phone or "", "provided": ""},
                        "address_details": address,
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
    parser.add_argument("--model", help="Model override for this evaluation only")
    parser.add_argument("--seed", type=int, default=20260923)
    parser.add_argument("--cases-file", type=Path, help="JSON array of prepared evaluation cases")
    args = parser.parse_args()
    cases = (
        json.loads(args.cases_file.read_text())
        if args.cases_file
        else [{"template": t, "seed": args.seed} for t in args.templates]
    )
    for case in cases:
        template_id = case["template"]
        data = sample(
            template_id,
            seed=case.get("seed", args.seed),
            parameters=case.get("parameters"),
            facts_override=case.get("facts"),
        )
        if args.without_model:
            data["narrative"]["mode"] = "template"
        job = SimpleNamespace(input=data, model_version=args.model or settings.llm_model)
        start = time.monotonic()
        text, metadata = compose(job)
        text, metadata = protect(data, text, metadata)
        print(
            json.dumps(
                {
                    "template": template_id,
                    "case": case.get("id", template_id),
                    "seconds": round(time.monotonic() - start, 2),
                    "facts": data["facts"],
                    "input": data,
                    "prompt": generation_prompt(data),
                    "text": text.model_dump(),
                    "metadata": metadata,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
