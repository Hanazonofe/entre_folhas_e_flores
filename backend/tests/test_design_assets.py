"""Verify the production static route accepts the shared Garden asset names."""
import pytest


@pytest.mark.parametrize('_spec', ['@spec:AC-074 recursos Garden servidos localmente'])
def test_design_assets_are_served_with_correct_content_types(tmp_path, monkeypatch, client, _spec):
    import pdv.app as module
    monkeypatch.setattr(module, 'WEB_ROOT', tmp_path)
    monkeypatch.setenv('APP_ENV', 'production')
    assets = {
        'design-tokens.css': (b':root { --ds-primary: #2f6b45; }', 'text/css'),
        'ui.css': (b'body { margin: 0; }', 'text/css'),
        'design-system.css': (b'.ds-card { padding: 24px; }', 'text/css'),
        'design-system.js': (b'"use strict";', 'javascript'),
        'garden-logo.jpg': (b'\xff\xd8\xff\xd9', 'image/jpeg'),
    }
    for name, (content, mime) in assets.items():
        (tmp_path / name).write_bytes(content)
        response = client.get('/' + name)
        assert response.status_code == 200
        assert response.content == content
        assert mime in response.headers['content-type']
    assert client.get('/not-an-allowed-asset.css').status_code == 404
