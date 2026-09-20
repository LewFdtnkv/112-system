from unittest.mock import MagicMock, Mock
from urllib.request import ProxyHandler

import pytest

from scripts import seed_demo


@pytest.mark.parametrize(
    "address",
    [
        "http://localhost:8000",
        "http://LOCALHOST.:8000",
        "http://127.0.0.1:8000",
        "http://127.0.0.2:8000",
        "http://[::1]:8000",
    ],
)
def test_loopback_seed_bypasses_system_proxy(monkeypatch, address):
    factory = Mock()
    monkeypatch.setattr(seed_demo, "build_opener", factory)
    api = seed_demo.API(address)
    handler = factory.call_args.args[0]
    assert isinstance(handler, ProxyHandler) and handler.proxies == {}
    # The configured opener is also the one used by every seed request.
    response = MagicMock()
    response.__enter__.return_value.status = 200
    response.__enter__.return_value.read.return_value = b'{"ok":true}'
    factory.return_value.open.return_value = response
    assert api.request("GET", "users/me") == {"ok": True}
    request = factory.return_value.open.call_args.args[0]
    assert request.full_url == address + "/api/v1/users/me"


def test_remote_seed_keeps_system_proxy(monkeypatch):
    factory = Mock()
    monkeypatch.setattr(seed_demo, "build_opener", factory)
    seed_demo.API("http://training.internal:8000")
    factory.assert_called_once_with()
