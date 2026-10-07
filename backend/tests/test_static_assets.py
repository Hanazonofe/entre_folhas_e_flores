"""Regression: the PDV must be able to load its barcode dependency."""
from importlib import import_module

from fastapi.testclient import TestClient


def test_barcode_script_is_served_without_authentication(tmp_path, monkeypatch):
    module = import_module("pdv.app")
    script = "window.BarcodeScanner = {};"
    (tmp_path / "barcode-scanner.js").write_text(script)
    monkeypatch.setattr(module, "WEB_ROOT", tmp_path)
    with TestClient(module.app) as client:
        response = client.get("/barcode-scanner.js")
        assert response.status_code == 200
        assert response.text == script
        assert "javascript" in response.headers["content-type"]
        assert client.get("/private-config.txt").status_code == 404
