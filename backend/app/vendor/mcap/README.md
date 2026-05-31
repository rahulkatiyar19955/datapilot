# Vendored `mcap` DuckDB extension

These are prebuilt binaries of the [`duckdb-mcap`](https://github.com/rahulkatiyar19955/duckdb-mcap)
extension, loaded at runtime by `backend/app/agent/tools/query_mcap.py` to run
SQL over raw MCAP rosbag files.

## Layout

```
vendor/mcap/<platform>/mcap.duckdb_extension
```

`<platform>` is derived from `platform.system()`/`platform.machine()`:

| Platform key | system / machine        | Used by                          |
|--------------|-------------------------|----------------------------------|
| `linux_amd64`| Linux x86_64            | backend Docker container (x86)   |
| `linux_arm64`| Linux aarch64           | backend Docker container (arm)   |
| `osx_arm64`  | Darwin arm64            | local macOS dev / tests          |

> macOS Intel (`osx_amd64`) is not built — Apple Silicon only for local dev.

The backend runs in a **Linux** container, so `linux_amd64` / `linux_arm64`
are the binaries that matter in production; `osx_arm64` is for local dev.

## ABI / version pin (IMPORTANT)

The extension is **built against DuckDB v1.4.4**. The Python `duckdb` wheel in
`backend/pyproject.toml` is pinned to `>=1.4,<1.5` to match. **If you bump the
duckdb version, you must rebuild these binaries against the matching DuckDB
release** — a mismatched ABI fails to load.

The extension is unsigned, so the tool opens DuckDB with
`config={"allow_unsigned_extensions": "true"}`.

## Runtime shared libraries (Linux)

The Linux binaries dynamically link:
- `liblz4.so.1` — present natively in the bookworm `python:3.11-slim` base.
- `libprotobuf.so.23` — **not** in bookworm (which ships `.so.32`). The release
  binaries are built on Ubuntu 22.04 (jammy, protobuf 3.12 → soname 23), so
  `backend/Dockerfile` grafts jammy's `libprotobuf.so.23` into the image per
  arch. If you rebuild the extension on a different distro, update the soname /
  `.deb` version in the Dockerfile to match `objdump -p … | grep NEEDED`.
- zstd is **not** a runtime dep — those symbols come from DuckDB's bundled copy.

The macOS binary links Homebrew's `liblz4` / `libprotobuf`; install via
`brew install lz4 protobuf` for local dev.

## How to obtain the binaries

### Preferred: download from the duckdb-mcap GitHub Release

The [`duckdb-mcap`](https://github.com/rahulkatiyar19955/duckdb-mcap) repo has a
`Build & Release` workflow that compiles the extension for every platform and
attaches the binaries to each `v*` release as
`mcap-<platform>.duckdb_extension` (+ `SHA256SUMS`).

```bash
# Pick the release tag (must be the v1.4.4-ABI line) and download per platform:
REL=v0.1.0
base="https://github.com/rahulkatiyar19955/duckdb-mcap/releases/download/$REL"
for plat in linux_amd64 linux_arm64 osx_arm64; do
  mkdir -p "$plat"
  curl -fsSL "$base/mcap-$plat.duckdb_extension" -o "$plat/mcap.duckdb_extension"
done
# (optional) verify against the release SHA256SUMS
```

Drop each file at `vendor/mcap/<platform>/mcap.duckdb_extension` and commit.

### Alternative: build locally

From a checkout of `duckdb-mcap` (submodules pinned to DuckDB v1.4.4):

```bash
make                      # -> build/release/extension/mcap/mcap.duckdb_extension
```

Copy the result into the matching `<platform>/` folder. For Linux binaries from
a macOS host, build inside a container on the **container-local** filesystem
(not a bind mount, which breaks ninja dependency-file writes) — see the release
workflow `.github/workflows/release.yml` for the exact dep list and steps.

> The tool returns `extension_unavailable` on any platform whose folder is
> empty, so populate `linux_amd64` / `linux_arm64` before deploying the
> containerized backend.
