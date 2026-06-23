"""Unit coverage for app.services.tf_parser.TFParser.

Covers TF frame extraction from both object-attribute and dict message shapes,
slash-prefix cleanup, accumulation across calls, and the bare-except swallow
behavior (malformed messages are silently ignored rather than raising).
"""
from __future__ import annotations

from types import SimpleNamespace

from app.services.tf_parser import TFParser


def _obj_transform(child, parent):
    """Build an object-style TransformStamped (attribute access)."""
    return SimpleNamespace(
        child_frame_id=child,
        header=SimpleNamespace(frame_id=parent),
    )


class TestParseObjectShape:
    def test_single_transform(self):
        p = TFParser()
        msg = SimpleNamespace(transforms=[_obj_transform("base_link", "odom")])
        p.parse_tf_message(msg)
        assert p.frames == {"base_link": "odom"}

    def test_multiple_transforms(self):
        p = TFParser()
        msg = SimpleNamespace(transforms=[
            _obj_transform("base_link", "odom"),
            _obj_transform("laser_link", "base_link"),
        ])
        p.parse_tf_message(msg)
        assert p.frames == {"base_link": "odom", "laser_link": "base_link"}

    def test_strips_leading_slashes(self):
        p = TFParser()
        msg = SimpleNamespace(transforms=[_obj_transform("/laser_link", "/base_link")])
        p.parse_tf_message(msg)
        assert p.frames == {"laser_link": "base_link"}


class TestParseDictShape:
    def test_dict_message_and_dict_transforms(self):
        p = TFParser()
        msg = {
            "transforms": [
                {"child_frame_id": "base_link", "header": {"frame_id": "odom"}},
            ]
        }
        p.parse_tf_message(msg)
        assert p.frames == {"base_link": "odom"}

    def test_dict_multiple(self):
        p = TFParser()
        msg = {
            "transforms": [
                {"child_frame_id": "base_link", "header": {"frame_id": "odom"}},
                {"child_frame_id": "imu_link", "header": {"frame_id": "base_link"}},
            ]
        }
        p.parse_tf_message(msg)
        assert p.frames == {"base_link": "odom", "imu_link": "base_link"}


class TestAccumulationAndOutput:
    def test_accumulates_across_calls(self):
        p = TFParser()
        p.parse_tf_message(SimpleNamespace(transforms=[_obj_transform("base_link", "odom")]))
        p.parse_tf_message(SimpleNamespace(transforms=[_obj_transform("laser_link", "base_link")]))
        assert p.frames == {"base_link": "odom", "laser_link": "base_link"}

    def test_later_call_overwrites_same_child(self):
        p = TFParser()
        p.parse_tf_message(SimpleNamespace(transforms=[_obj_transform("base_link", "odom")]))
        p.parse_tf_message(SimpleNamespace(transforms=[_obj_transform("base_link", "world")]))
        assert p.frames == {"base_link": "world"}

    def test_get_frames_list_shape(self):
        p = TFParser()
        p.parse_tf_message(SimpleNamespace(transforms=[_obj_transform("base_link", "odom")]))
        out = p.get_frames_list()
        assert out == [{"name": "base_link", "parent": "odom"}]

    def test_get_frames_list_empty_when_no_frames(self):
        assert TFParser().get_frames_list() == []


class TestEdgeAndErrorPaths:
    def test_empty_transforms_list(self):
        p = TFParser()
        p.parse_tf_message(SimpleNamespace(transforms=[]))
        assert p.frames == {}

    def test_missing_child_skips_transform(self):
        p = TFParser()
        # child_frame_id is None → pair is incomplete → not recorded.
        msg = SimpleNamespace(transforms=[
            SimpleNamespace(child_frame_id=None, header=SimpleNamespace(frame_id="odom")),
        ])
        p.parse_tf_message(msg)
        assert p.frames == {}

    def test_missing_parent_skips_transform(self):
        p = TFParser()
        msg = SimpleNamespace(transforms=[
            SimpleNamespace(child_frame_id="base_link", header=SimpleNamespace(frame_id=None)),
        ])
        p.parse_tf_message(msg)
        assert p.frames == {}

    def test_no_transforms_attribute_is_ignored(self):
        # An object with no `transforms` attr and not a dict → getattr default []
        # so nothing happens, no exception.
        p = TFParser()
        p.parse_tf_message(SimpleNamespace(foo="bar"))
        assert p.frames == {}

    def test_bare_except_swallows_malformed_transform(self):
        # NOTE: parse_tf_message wraps its body in `except Exception: pass`,
        # so a transform whose `header` attribute access raises is silently
        # swallowed — the parser never propagates the error. We characterize
        # that behavior here: no exception, and frames stays empty.
        class Exploding:
            child_frame_id = "base_link"

            @property
            def header(self):  # noqa: D401 - intentionally raises on access
                raise RuntimeError("boom")

        p = TFParser()
        # Must not raise despite the exploding property.
        p.parse_tf_message(SimpleNamespace(transforms=[Exploding()]))
        assert p.frames == {}

    def test_bare_except_swallows_non_iterable_transforms(self):
        # transforms is a non-iterable int → iterating raises → swallowed.
        p = TFParser()
        p.parse_tf_message(SimpleNamespace(transforms=123))
        assert p.frames == {}

    def test_none_message_is_swallowed(self):
        p = TFParser()
        # getattr(None, 'transforms', []) -> [] ; isinstance(None, dict) False.
        p.parse_tf_message(None)
        assert p.frames == {}
