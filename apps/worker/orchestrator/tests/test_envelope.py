"""Envelope contract: strict validation, unknown fields and bad enums rejected."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.envelope import OrchestratorInput

from .conftest import envelope_dict


def test_valid_envelope_parses():
    env = OrchestratorInput.model_validate(envelope_dict())
    assert env.channel.value == "whatsapp"
    assert env.runtime.adapter_id == "real-estate-v2"


def test_unknown_top_level_field_rejected():
    with pytest.raises(ValidationError, match="surprise"):
        OrchestratorInput.model_validate(envelope_dict(surprise="hello"))


def test_unknown_nested_field_rejected():
    data = envelope_dict()
    data["runtime"]["gpu_count"] = 8
    with pytest.raises(ValidationError, match="gpu_count"):
        OrchestratorInput.model_validate(data)


def test_bad_channel_rejected():
    with pytest.raises(ValidationError, match="channel"):
        OrchestratorInput.model_validate(envelope_dict(channel="sms"))


def test_bad_mode_rejected():
    with pytest.raises(ValidationError):
        OrchestratorInput.model_validate(envelope_dict(mode="yolo"))


def test_unknown_message_type_rejected():
    data = envelope_dict()
    data["message"]["type"] = "hologram"
    with pytest.raises(ValidationError):
        OrchestratorInput.model_validate(data)
