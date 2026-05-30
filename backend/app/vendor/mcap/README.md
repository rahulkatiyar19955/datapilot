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
| `osx_amd64`  | Darwin x86_64           | local macOS dev (Intel)          |

The backend runs in a **Linux** container, so `linux_amd64` / `linux_arm64`
are the binaries that matter in production; `osx_arm64` is for local dev.

## ABI / version pin (IMPORTANT)

The extension is **built against DuckDB v1.4.4**. The Python `duckdb` wheel in
`backend/pyproject.toml` is pinned to `>=1.4,<1.5` to match. **If you bump the
duckdb version, you must rebuild these binaries against the matching DuckDB
release** — a mismatched ABI fails to load.

The extension is unsigned, so the tool opens DuckDB with
`config={"allow_unsigned_extensions": "true"}`.

## How to (re)build

From a checkout of `duckdb-mcap` (submodules pinned to DuckDB v1.4.4):

```bash
# Native build for the host platform:
make                      # -> build/release/extension/mcap/mcap.duckdb_extension

# Linux binaries (run on / cross-build via a manylinux or ubuntu container):
#   docker run --rm -v "$PWD":/src -w /src <linux-build-image> make
# then copy build/release/extension/mcap/mcap.duckdb_extension into the
# appropriate vendor/mcap/<platform>/ directory here.
```

Copy the resulting `mcap.duckdb_extension` into the matching `<platform>/`
folder and commit it.

> NOTE: only `osx_arm64` is committed today. The `linux_amd64` / `linux_arm64`
> folders must be populated with Linux builds before the containerized backend
> can use `query_mcap`; until then the tool returns `extension_unavailable` on
> Linux.
