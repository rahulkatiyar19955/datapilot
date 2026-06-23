"""Security tests for bag file path validation / containment (issue #80).

`filepath` arrives from an API/IPC payload and used to flow straight into
`os.path.exists`/`open()`. These tests pin the validation helper that must run
before any `open()`:

- canonicalize with realpath (defeat `..` / symlink escape),
- require an existing *regular* file (reject dirs, devices, FIFOs),
- require a `.mcap` / `.db3` extension (case-insensitive),
- when DATAPILOT_BAG_ROOT is set, require the realpath to be *within* that root.

They also assert the host->container translation in `_resolve_path` still works
and that `parse_bag` rejects a real-but-illegal file instead of opening it.
"""
import os

import pytest

from app.services.parser import (
    _resolve_path,
    _validate_bag_path,
    ingestion_parser,
)


# ── _validate_bag_path: extension / type / existence (no root configured) ──────

def test_validate_accepts_regular_mcap(tmp_path):
    bag = tmp_path / "good.mcap"
    bag.write_bytes(b"")
    assert _validate_bag_path(str(bag)) == os.path.realpath(str(bag))


def test_validate_accepts_db3_case_insensitive(tmp_path):
    bag = tmp_path / "good.DB3"
    bag.write_bytes(b"")
    assert _validate_bag_path(str(bag)) == os.path.realpath(str(bag))


def test_validate_rejects_wrong_extension(tmp_path):
    bad = tmp_path / "foo.txt"
    bad.write_bytes(b"")
    with pytest.raises(ValueError):
        _validate_bag_path(str(bad))


def test_validate_rejects_nonexistent(tmp_path):
    missing = tmp_path / "nope.mcap"
    with pytest.raises(ValueError):
        _validate_bag_path(str(missing))


def test_validate_rejects_directory(tmp_path):
    d = tmp_path / "a_dir.mcap"  # a directory that *looks* like a bag
    d.mkdir()
    with pytest.raises(ValueError):
        _validate_bag_path(str(d))


def test_validate_resolves_dotdot_traversal(tmp_path):
    bag = tmp_path / "real.mcap"
    bag.write_bytes(b"")
    sneaky = tmp_path / "sub" / ".." / "real.mcap"
    (tmp_path / "sub").mkdir()
    assert _validate_bag_path(str(sneaky)) == os.path.realpath(str(bag))


# ── DATAPILOT_BAG_ROOT containment ────────────────────────────────────────────

def test_validate_accepts_path_inside_root(tmp_path, monkeypatch):
    root = tmp_path / "bags"
    root.mkdir()
    bag = root / "inside.mcap"
    bag.write_bytes(b"")
    monkeypatch.setenv("DATAPILOT_BAG_ROOT", str(root))
    assert _validate_bag_path(str(bag)) == os.path.realpath(str(bag))


def test_validate_rejects_path_outside_root(tmp_path, monkeypatch):
    root = tmp_path / "bags"
    root.mkdir()
    outside = tmp_path / "outside.mcap"
    outside.write_bytes(b"")
    monkeypatch.setenv("DATAPILOT_BAG_ROOT", str(root))
    with pytest.raises(ValueError):
        _validate_bag_path(str(outside))


def test_validate_rejects_symlink_escaping_root(tmp_path, monkeypatch):
    root = tmp_path / "bags"
    root.mkdir()
    secret = tmp_path / "secret.mcap"
    secret.write_bytes(b"")
    link = root / "link.mcap"
    try:
        link.symlink_to(secret)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks not supported on this platform")
    monkeypatch.setenv("DATAPILOT_BAG_ROOT", str(root))
    # realpath() resolves the symlink to outside the root → must be rejected.
    with pytest.raises(ValueError):
        _validate_bag_path(str(link))


def test_validate_rejects_root_prefix_sibling(tmp_path, monkeypatch):
    """`/bags-evil/x.mcap` must not pass containment for root `/bags`.

    A naive str.startswith check would wrongly accept it; commonpath must not.
    """
    root = tmp_path / "bags"
    root.mkdir()
    sibling = tmp_path / "bags-evil"
    sibling.mkdir()
    bag = sibling / "x.mcap"
    bag.write_bytes(b"")
    monkeypatch.setenv("DATAPILOT_BAG_ROOT", str(root))
    with pytest.raises(ValueError):
        _validate_bag_path(str(bag))


# ── _resolve_path host->container translation must still work ──────────────────

def test_resolve_path_translates_host_path(tmp_path, monkeypatch):
    # Simulate: host path /Users/<name>/Documents/robot.mcap with HOST_MOUNT=tmp.
    mount = tmp_path / "host"
    docs = mount / "Documents"
    docs.mkdir(parents=True)
    bag = docs / "robot.mcap"
    bag.write_bytes(b"")

    # The original /Users/... path does not exist on this machine, so translation
    # should kick in and map it under the mount.
    monkeypatch.setattr("app.services.parser._HOST_MOUNT", str(mount))
    translated = _resolve_path("/Users/someuser/Documents/robot.mcap")
    assert translated == str(bag)


def test_resolve_path_returns_existing_path_untouched(tmp_path):
    bag = tmp_path / "robot.mcap"
    bag.write_bytes(b"")
    assert _resolve_path(str(bag)) == str(bag)


# ── parse_bag must reject a real-but-illegal file before opening it ────────────

@pytest.mark.asyncio
async def test_parse_bag_rejects_real_file_outside_root(tmp_path, monkeypatch):
    root = tmp_path / "bags"
    root.mkdir()
    # A real file with a valid extension but OUTSIDE the configured root.
    evil = tmp_path / "etc_passwd.mcap"
    evil.write_bytes(b"not a real bag")
    monkeypatch.setenv("DATAPILOT_BAG_ROOT", str(root))
    with pytest.raises(ValueError):
        await ingestion_parser.parse_bag(str(evil))


@pytest.mark.asyncio
async def test_parse_bag_rejects_wrong_extension_real_file(tmp_path):
    bad = tmp_path / "secret.txt"
    bad.write_bytes(b"top secret")
    with pytest.raises(ValueError):
        await ingestion_parser.parse_bag(str(bad))
