"""Keep the text share in frozen evidence; historical checks retain their original share."""

DEFAULT_TEXT_WEIGHT_PERCENT = 25
LEGACY_TEXT_WEIGHT_PERCENT = 20


def text_weight(snapshot):
    return snapshot.get("semantic_weight_percent", LEGACY_TEXT_WEIGHT_PERCENT)
