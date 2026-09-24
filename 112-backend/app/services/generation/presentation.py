"""Resolve the information available to the learner, not an invented complete dossier."""

import json
from pathlib import Path

from app.services.catalog_rules import feature_is_visible
from app.services.generation.evidence import BOOLEAN_PHRASES


def prepare_message(plan, p, definitions, rng):
    plan["message_format"] = p.message_format or rng.choice(["call", "sms"])
    plan["caller_information"] = p.caller_information or (
        "full"
        if p.gender or p.age is not None
        else "name_only"
        if p.caller_name
        else "anonymous"
        if plan["message_format"] == "sms"
        else rng.choice(["full", "name_only", "anonymous"])
    )
    if plan["message_format"] != "sms":
        return
    # Do not turn unreported optional negatives into scored facts in a short SMS.
    plan["answers"] = {
        f.key: plan["answers"][f.key]
        for f in definitions
        if f.key in plan["answers"]
        and (
            plan["answers"][f.key] is not False
            or f.required
            or f.key in p.feature_answers
            or (f.key in plan["covered_features"] and f.key not in BOOLEAN_PHRASES)
        )
    }
    visible = {}
    for f in definitions:
        if f.key in plan["answers"] and feature_is_visible(f, visible):
            visible[f.key] = plan["answers"][f.key]
    plan["answers"] = visible
    for key, parameter in (
        ("hasVictims", "has_victims"),
        ("blocked", "blocked"),
        ("refusedAmbulance", "refused_ambulance"),
    ):
        known = getattr(p, parameter) is not None
        if key == "hasVictims":
            known |= p.victims_count is not None or any(
                k in visible for k in ("injured", "victims", "medical_help")
            )
        if not plan["flags"][key] and not known:
            del plan["flags"][key]
    if "hasVictims" not in plan["flags"]:
        plan["victims_count"] = None


def resolve_caller(p, plan, rng, names):
    info = plan["caller_information"]
    gender = p.gender or rng.choice(["male", "female"])
    name = p.caller_name or rng.choice(names[gender])
    if info == "anonymous":
        name = None
    elif info == "name_only" and not p.caller_name:
        name = name.split()[0]
    return (
        name,
        ("Мужской" if gender == "male" else "Женский") if info == "full" else None,
        (p.age if p.age is not None else rng.randint(18, 80)) if info == "full" else None,
        f"+7 (000) 000-{rng.randrange(100):02}-{rng.randrange(100):02}"
        if plan["message_format"] == "call"
        else None,
    )


def resolve_address(p, plan, rng, choices):
    if plan["service_call"]:
        return {}, ""
    address = {k: getattr(p, k) or rng.choice(choices[k]) for k in ("locality", "street")}
    if plan["message_format"] == "call":
        address["object"] = plan["object"]
    descriptive = p.address_format == "descriptive" or bool(p.address_description)
    if p.address_format is None and not p.house and not p.address_description:
        descriptive = rng.random() < 0.35
    plan["address_format"] = "descriptive" if descriptive else "structured"
    if descriptive:
        templates = json.loads(
            (Path(__file__).parents[2] / "data/generation_addresses.json").read_text()
        )
        compatible = [t for t in templates if plan["object"] in t["objects"]]
        if p.address_description:
            description = p.address_description
            plan["address_template"] = "teacher"
        else:
            template = rng.choice(compatible)
            description = template["description"]
            plan["address_template"] = template["id"]
        address["description"] = description
        return address, f"{address['locality']}, {address['street']}, {description}"
    address["house"] = p.house or rng.choice(choices["house"])
    return address, f"{address['locality']}, {address['street']}, д. {address['house']}"
