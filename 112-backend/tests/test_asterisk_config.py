"""Published SIP/RTP must also work for clients behind Docker Desktop's gateway."""

import runpy
from ipaddress import ip_address, ip_network
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.mark.parametrize("configured", [None, "", "auto"])
@pytest.mark.parametrize("configured_ice", [None, "", "172.18.0.8"])
def test_default_nat_excludes_docker_gateway(monkeypatch, configured, configured_ice):
    monkeypatch.setenv("ARI_PASSWORD", "test-only-asterisk-password-123")
    monkeypatch.setenv("SIP_PUBLIC_ADDRESS", "127.0.0.1")
    if configured_ice is None:
        monkeypatch.delenv("SIP_ICE_ADDRESS", raising=False)
    else:
        monkeypatch.setenv("SIP_ICE_ADDRESS", configured_ice)
    if configured is None:
        monkeypatch.delenv("SIP_LOCAL_NET", raising=False)
    else:
        monkeypatch.setenv("SIP_LOCAL_NET", configured)
    with (
        patch("socket.gethostbyname", return_value="172.18.0.4"),
        patch.object(Path, "write_text"),
        patch.object(Path, "chmod"),
        patch("os.execvp"),
    ):
        result = runpy.run_path(str(Path(__file__).parents[1] / "telephony/asterisk/start.py"))
    network = ip_network(result["local_net"])
    assert ip_address("172.18.0.4") in network  # SDP address must be eligible for rewriting.
    assert ip_address("172.18.0.1") not in network  # Published-port client must be external.
    assert "external_signaling_address=127.0.0.1" in result["configs"]["pjsip.conf"]
    assert "external_media_address=127.0.0.1" in result["configs"]["pjsip.conf"]
    expected_ice = configured_ice or "172.18.0.4"
    assert f"{expected_ice} => 127.0.0.1" in result["configs"]["rtp.conf"]
