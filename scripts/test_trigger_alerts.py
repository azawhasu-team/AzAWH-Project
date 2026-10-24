import io
import json
import urllib.error
from unittest import mock

import trigger_alerts

OK = {"expected_live": ["a"], "active": [], "notifications": [{"kind": "new", "title": "A down", "channels": {"slack": "sent"}}]}


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


def test_requires_key(monkeypatch, capsys):
    monkeypatch.delenv("AWH_ADMIN_KEY", raising=False)
    assert trigger_alerts.main([]) == 2


def test_success_prints_and_sends_key_header(monkeypatch, capsys):
    monkeypatch.setenv("AWH_ADMIN_KEY", "k")
    with mock.patch("urllib.request.urlopen", return_value=_Resp(json.dumps(OK).encode())) as up:
        assert trigger_alerts.main(["--dry-run", "--url", "https://x/"]) == 0
    req = up.call_args[0][0]
    assert req.full_url == "https://x/admin/alerts/evaluate?dry_run=true"
    assert req.get_header("X-admin-key") == "k" and req.get_method() == "POST"
    assert "A down" in capsys.readouterr().out


def test_http_error_and_unreachable_fail(monkeypatch):
    monkeypatch.setenv("AWH_ADMIN_KEY", "k")
    err = urllib.error.HTTPError("u", 403, "no", {}, io.BytesIO(b"{}"))
    with mock.patch("urllib.request.urlopen", side_effect=err):
        assert trigger_alerts.main([]) == 1
    with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
        assert trigger_alerts.main([]) == 1
