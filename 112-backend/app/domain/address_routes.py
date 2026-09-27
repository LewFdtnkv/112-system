"""Conservative address matching. Unknown territory is never guessed from prose."""

import re


def normalize(value):
    return re.sub(r"\s+", " ", str(value or "").casefold().replace("ё", "е")).strip(" .,")


def address_matches(groups, address):
    # Explicit aliases belong in separate OR groups; no fuzzy geography or LLM lookup.
    return not groups or any(
        all(normalize((address or {}).get(key)) == normalize(value) for key, value in group.items())
        for group in groups
    )
