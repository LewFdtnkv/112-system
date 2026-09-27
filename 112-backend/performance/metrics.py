"""Bounded millisecond histogram and explicit overload accounting."""

import math
from collections import Counter


class Metrics:
    def __init__(self):
        self.latency = Counter()
        self.status = Counter()
        self.ok = 0
        self.errors = 0

    def add(self, seconds, status, valid):
        self.latency[min(60000, max(0, round(seconds * 1000)))] += 1
        self.status[str(status)] += 1
        self.ok += int(valid)
        self.errors += int(not valid)

    def percentile(self, fraction):
        threshold = math.ceil(sum(self.latency.values()) * fraction)
        cumulative = 0
        for latency, count in sorted(self.latency.items()):
            cumulative += count
            if cumulative >= threshold:
                return latency
        return None

    def result(self, duration):
        return {
            "successful": self.ok,
            "errors": self.errors,
            "successful_rps": round(self.ok / duration, 2),
            "p50_ms": self.percentile(0.5),
            "p95_ms": self.percentile(0.95),
            "p99_ms": self.percentile(0.99),
            "max_ms": max(self.latency, default=None),
            "status": dict(self.status),
        }


def acceptable(result):
    """Exploratory API SLO, not a claim of full browser/VoIP acceptance."""
    total = result["successful"] + result["errors"] + result["dropped"]
    return (
        total > 0
        and (result["errors"] + result["dropped"]) / total <= 0.01
        and result["p95_ms"] is not None
        and result["p95_ms"] <= 2000
    )
