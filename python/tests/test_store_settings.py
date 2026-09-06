"""Settings storage must keep plaintext secrets out of the renderer-facing
payload while never wiping a stored key on an unchanged save."""
import pytest

from python.services import store


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    """Point the JSON file at a temp path and back the keychain with an
    in-memory dict so the tests never touch the real OS keyring."""
    monkeypatch.setattr(store, "_SETTINGS_FILE", tmp_path / "settings.json")
    secrets: dict[str, str] = {}
    monkeypatch.setattr(store, "_get_secret", lambda name: secrets.get(name, ""))

    def _set(name, value):
        # Mirror the real guard: empty values never overwrite a stored secret.
        if not value:
            return
        secrets[name] = value

    monkeypatch.setattr(store, "_set_secret", _set)
    return secrets


def test_get_public_settings_replaces_secrets_with_presence_flags(isolated_store):
    store.save_settings({
        "anthropicApiKey": "sk-ant-secret",
        "aiModel": "claude-sonnet-4-5",
    })

    public = store.get_public_settings()

    # No plaintext secret is present under any secret key.
    for key in store.SECRET_KEYS:
        assert key not in public
    # Presence flags reflect what is stored.
    assert public["hasAnthropicApiKey"] is True
    assert public["hasApiKey"] is True  # mirrored from the anthropic key
    assert public["hasElevenLabsApiKey"] is False
    # Non-secret settings pass through unchanged.
    assert public["aiModel"] == "claude-sonnet-4-5"


def test_no_secret_value_appears_in_public_payload(isolated_store):
    store.save_settings({"anthropicApiKey": "sk-ant-topsecret"})
    assert "sk-ant-topsecret" not in repr(store.get_public_settings())


def test_get_settings_still_exposes_secrets_for_server_side_callers(isolated_store):
    store.save_settings({"githubToken": "ghp_token"})
    # Server-side code (e.g. mcp_tools._github_headers) relies on this.
    assert store.get_settings()["githubToken"] == "ghp_token"


def test_unchanged_save_does_not_wipe_stored_secret(isolated_store):
    store.save_settings({"anthropicApiKey": "sk-ant-keep"})
    # Renderer omits blank secret fields, but even an explicit empty string
    # must not erase the stored key.
    store.save_settings({"anthropicApiKey": "", "aiModel": "claude-opus-4-1"})

    assert store.get_settings()["anthropicApiKey"] == "sk-ant-keep"
    assert store.get_public_settings()["hasAnthropicApiKey"] is True


def test_new_secret_value_overwrites_previous(isolated_store):
    store.save_settings({"anthropicApiKey": "sk-ant-old"})
    store.save_settings({"anthropicApiKey": "sk-ant-new"})
    assert store.get_settings()["anthropicApiKey"] == "sk-ant-new"
