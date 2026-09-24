import hashlib


def field_token(value):
    return hashlib.sha256(value.strip().encode()).hexdigest()


def is_free_text(source, field):
    if not field.scored:
        return True
    return any(
        f.get("type") == "text" and field.field == f"features.ekp.{f['key']}"
        for f in source.get("feature_definitions", [])
    )
