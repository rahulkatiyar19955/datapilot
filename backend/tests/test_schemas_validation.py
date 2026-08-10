"""Request-schema validation hardening (issue #67).

ChatRequest.message must be bounded; composer_provider must be a known provider
or absent; SessionCreate.filepath must be non-empty.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import ChatRequest, SessionCreate

# Mirror the cap declared on ChatRequest.message.
from app.schemas import MAX_MESSAGE_CHARS


class TestChatRequestMessage:
    def test_valid_message_ok(self):
        req = ChatRequest(message="why did the robot stop?")
        assert req.message == "why did the robot stop?"

    def test_empty_message_rejected(self):
        with pytest.raises(ValidationError):
            ChatRequest(message="")

    def test_oversized_message_rejected(self):
        with pytest.raises(ValidationError):
            ChatRequest(message="x" * (MAX_MESSAGE_CHARS + 1))

    def test_message_at_cap_ok(self):
        req = ChatRequest(message="x" * MAX_MESSAGE_CHARS)
        assert len(req.message) == MAX_MESSAGE_CHARS


class TestChatRequestProvider:
    def test_known_provider_ok(self):
        assert ChatRequest(message="hi", composer_provider="anthropic").composer_provider == "anthropic"

    def test_none_provider_ok(self):
        assert ChatRequest(message="hi").composer_provider is None

    def test_unknown_provider_rejected(self):
        with pytest.raises(ValidationError):
            ChatRequest(message="hi", composer_provider="totally-bogus")


class TestSessionCreateFilepath:
    def test_valid_filepath_ok(self):
        assert SessionCreate(filepath="/abs/run.mcap").filepath == "/abs/run.mcap"

    def test_empty_filepath_rejected(self):
        with pytest.raises(ValidationError):
            SessionCreate(filepath="")

    def test_whitespace_filepath_rejected(self):
        with pytest.raises(ValidationError):
            SessionCreate(filepath="   ")
