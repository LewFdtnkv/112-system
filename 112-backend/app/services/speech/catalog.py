"""Versioned local voice allowlist shared by API and the isolated CPU worker."""

VERSION = "piper-1.8.0-v1"
VOICES = {
    "denis": "Денис — мужской голос",
    "dmitri": "Дмитрий — мужской голос",
}
PURPOSES = ("caller", "greeting", "acknowledgment")


def version(purpose):
    return f"{VERSION}:{purpose}"
