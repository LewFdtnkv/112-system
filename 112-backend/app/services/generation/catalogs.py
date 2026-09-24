"""Faker caller names and bundled address pairs; no runtime network dependency."""

import json
from functools import lru_cache
from pathlib import Path

from faker import VERSION as FAKER_VERSION
from faker.generator import Generator
from faker.providers.person.ru_RU import Provider as RussianPerson

DATA = Path(__file__).parents[2] / "data"
PATRONYMIC_PROBABILITY = 0.8
CALLER_NAME_SOURCE = f"faker-{FAKER_VERSION}:ru_RU"


def random_caller(rng, gender=None, *, name_only=False):
    gender = gender or rng.choice(["male", "female"])
    generator = Generator()
    # Use this card's RNG, never Faker's shared global random state.
    generator.random = rng
    person = RussianPerson(generator)
    first_name = getattr(person, f"first_name_{gender}")()
    if name_only:
        return first_name, gender
    last_name = getattr(person, f"last_name_{gender}")()
    patronymic = (
        getattr(person, f"middle_name_{gender}")()
        if rng.random() < PATRONYMIC_PROBABILITY
        else None
    )
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
