import os

import pytest

from tripwise_api.config import Settings, apply_emulator_hosts


@pytest.fixture(autouse=True)
def _clean_emulator_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)


def test_emulator_hosts_are_exported_locally() -> None:
    settings = Settings(
        environment="local",
        firebase_project_id="demo-tripwise",
        firestore_emulator_host="127.0.0.1:8180",
    )

    apply_emulator_hosts(settings)

    assert os.environ["FIRESTORE_EMULATOR_HOST"] == "127.0.0.1:8180"
    assert "FIREBASE_AUTH_EMULATOR_HOST" not in os.environ


def test_emulator_hosts_are_never_exported_in_production() -> None:
    settings = Settings(
        environment="production",
        firebase_project_id="tripwise-plan",
        firestore_emulator_host="127.0.0.1:8180",
    )

    apply_emulator_hosts(settings)

    assert "FIRESTORE_EMULATOR_HOST" not in os.environ
