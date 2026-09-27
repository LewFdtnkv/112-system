from performance.metrics import Metrics, acceptable


def test_capacity_counts_errors_and_tail_not_just_successful_requests():
    metrics = Metrics()
    for _ in range(98):
        metrics.add(0.01, 200, True)
    metrics.add(0.9, 503, False)
    metrics.add(10, "ReadTimeout", False)
    result = metrics.result(10)
    assert result["successful_rps"] == 9.8
    assert result["p99_ms"] == 900
    assert result["errors"] == 2
    assert not acceptable(result | {"dropped": 0})


def test_unserved_arrivals_fail_capacity_even_with_fast_successes():
    metrics = Metrics()
    metrics.add(0.01, 200, True)
    result = metrics.result(1)
    assert acceptable(result | {"dropped": 0})
    assert not acceptable(result | {"dropped": 999})
    assert not acceptable(Metrics().result(1) | {"dropped": 1})
