"""Network boundaries shared by generation, assessment and study advice."""

import io
import json
import urllib.error
from types import SimpleNamespace

import pytest

from app.core import ollama


def test_request_preserves_payload_timeout_and_disables_environment_proxy(monkeypatch):
    monkeypatch.setattr(ollama.settings, "llm_base_url", "http://local-model:11434/")
    body = {"model": "test", "messages": [{"role": "user", "content": "Текст"}]}
    payload = b'{"done":true}'
    response = io.BytesIO(payload)

    def open_request(request, timeout):
        assert request.full_url == "http://local-model:11434/api/chat"
        assert request.method == "POST"
        assert request.headers["Content-type"] == "application/json"
        assert json.loads(request.data) == body
        assert timeout == 7.5
        return response

    def opener(handler):
        assert handler.proxies == {}
        return SimpleNamespace(open=open_request)

    monkeypatch.setattr(ollama.urllib.request, "build_opener", opener)
    assert ollama.chat(body, timeout=7.5, max_response_bytes=len(payload)) == {"done": True}
    assert response.closed


@pytest.mark.parametrize("payload", [b"x" * 33, b"[1]", b"null", b"broken JSON"])
def test_invalid_or_oversized_response_is_rejected_and_closed(monkeypatch, payload):
    class Response(io.BytesIO):
        def read(self, size):
            assert size == 33  # Bounded read, never load an unbounded model response.
            return super().read(size)

    response = Response(payload)
    monkeypatch.setattr(
        ollama.urllib.request,
        "build_opener",
        lambda *args: SimpleNamespace(open=lambda *a, **kw: response),
    )
    with pytest.raises(ValueError):
        ollama.chat({}, timeout=1, max_response_bytes=32)
    assert response.closed


@pytest.mark.parametrize(
    "error",
    [TimeoutError(), urllib.error.HTTPError("http://local-model", 404, "missing", {}, None)],
)
def test_transport_does_not_retry_or_hide_error_type(monkeypatch, error):
    calls = []

    def unavailable(*args, **kwargs):
        calls.append(1)
        raise error

    monkeypatch.setattr(
        ollama.urllib.request,
        "build_opener",
        lambda *args: SimpleNamespace(open=unavailable),
    )
    with pytest.raises(type(error)) as raised:
        ollama.chat({}, timeout=1, max_response_bytes=32)
    assert raised.value is error
    assert calls == [1]


@pytest.mark.parametrize("result", [{}, {"done": False}, {"done": True, "done_reason": "length"}])
def test_partial_model_output_is_not_success(result):
    with pytest.raises(ValueError, match="Incomplete"):
        ollama.require_complete(result)
