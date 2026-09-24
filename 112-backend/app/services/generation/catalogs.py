"""Bundled name dictionaries and address pairs; no runtime network dependency."""

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parents[2] / "data"
PATRONYMIC_PROBABILITY = 0.8


@lru_cache
def name_catalog():
    return json.loads((DATA / "generation_names.json").read_text(encoding="utf-8"))


def random_caller(rng, gender=None, *, name_only=False):
    gender = gender or rng.choice(["male", "female"])
    words = name_catalog()["genders"][gender]
    first_name = rng.choice(words["first_name"])
    if name_only:
        return first_name, gender
    last_name = rng.choice(words["last_name"])
    patronymic = rng.choice(words["patronymic"]) if rng.random() < PATRONYMIC_PROBABILITY else None
    return " ".join(filter(None, (last_name, first_name, patronymic))), gender


def normalize(value):
    return " ".join(value.casefold().replace("ё", "е").split())


@lru_cache
def address_catalog():
    return json.loads((DATA / "generation_moscow_addresses.json").read_text(encoding="utf-8"))


def matching_addresses(p):
    return [
        a
        for a in address_catalog()["addresses"]
        if all(
            getattr(p, key) is None or normalize(getattr(p, key)) == normalize(a[key])
            for key in ("locality", "street", "house")
        )
    ]
