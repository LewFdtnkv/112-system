"""Resolve the information available to the learner, not an invented complete dossier."""

import json
from pathlib import Path

from app.services.catalog_rules import feature_is_visible
from app.services.generation.catalogs import (
    CALLER_NAME_SOURCE,
    address_catalog,
    matching_addresses,
    random_caller,
)
from app.services.generation.evidence import BOOLEAN_PHRASES
from app.services.generation.validation import reject_parameters


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
    # Unreported optional negatives are unknown in either channel, not scored facts.
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


def resolve_caller(p, plan, rng):
    info = plan["caller_information"]
    if info == "anonymous":
        name, gender = None, None
    elif p.caller_name:
        name, gender = p.caller_name, p.gender
    else:
        name, gender = random_caller(rng, p.gender, name_only=info == "name_only")
    plan["speaker_gender"] = gender
    plan["caller_name_source"] = (
        None if info == "anonymous" else "teacher" if p.caller_name else CALLER_NAME_SOURCE
    )
    # A custom name without an explicit gender must not receive a made-up one.
    return (
        name,
        {"male": "Мужской", "female": "Женский"}.get(gender) if info == "full" else None,
        (p.age if p.age is not None else rng.randint(18, 80)) if info == "full" else None,
        f"+7 (000) 000-{rng.randrange(100):02}-{rng.randrange(100):02}"
        if plan["message_format"] == "call"
        else None,
    )


def resolve_address(p, plan, rng):
    if plan["service_call"]:
        return {}, ""
    matches = matching_addresses(p)
    selected = rng.choice(matches) if matches else None
    if not selected and (
        not p.street
        or not p.house
        and not (p.address_format == "descriptive" or p.address_description)
    ):
        reject_parameters(
            "В справочнике нет подходящего адреса. Укажите улицу и дом вручную "
            "или выберите описательный адрес.",
            "street",
            "house",
            "address_format",
        )
    address = {
        "locality": p.locality or (selected["locality"] if selected else "Москва"),
        "street": p.street or selected["street"],
    }
    plan["address_record_id"] = selected["id"] if selected else None
    plan["address_source"] = address_catalog()["version"] if selected else "teacher"
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
    address["house"] = p.house or selected["house"]
    text = f"{address['locality']}, {address['street']}, д. {address['house']}"
    for key, label in (("building", "корп."), ("structure", "стр.")):
        if value := getattr(p, key):
            address[key] = value
            text += f", {label} {value}"
    return address, text
