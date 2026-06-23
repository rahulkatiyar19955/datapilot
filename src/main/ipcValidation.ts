/**
 * Pure, dependency-free runtime guards for Electron IPC payloads.
 *
 * Every `ipcMain.handle` handler in `ipcHandlers.ts` must treat its arguments
 * as untrusted input coming from a potentially compromised renderer (see
 * AGENT.md → "IPC Validation" and "Security & Privacy Guardrails"). These
 * helpers narrow `unknown` into concrete types and throw `IpcValidationError`
 * with a clean, non-sensitive message when the shape is wrong.
 *
 * There is no Zod dependency in this project, so these are explicit TypeScript
 * type guards / asserts. Keep them small and pure so they remain easy to audit
 * and (eventually) unit-test.
 */

/**
 * Error type for rejected IPC payloads. Thrown from guards and surfaced to the
 * renderer as a rejected `invoke` promise — it never crashes the main process.
 */
export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcValidationError";
  }
}

/** Narrows an unknown value to a non-empty string, or throws. */
export function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new IpcValidationError(`${label} must be a string`);
  }
  return value;
}

/** Narrows to a string that is non-empty after trimming, or throws. */
export function assertNonEmptyString(value: unknown, label: string): string {
  const str = assertString(value, label);
  if (str.length === 0) {
    throw new IpcValidationError(`${label} must not be empty`);
  }
  return str;
}

/**
 * Keys that must never be accepted as settings/keychain keys because writing
 * to them on a plain object can pollute the prototype chain (resolves #29).
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Allowed characters for settings / keychain keys: identifier-safe only. */
const SAFE_KEY_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Validates a settings/keychain key. Enforces a strict identifier-only charset
 * and explicitly rejects prototype-pollution vectors. Returns the key on
 * success; throws `IpcValidationError` otherwise.
 */
export function assertSafeKey(value: unknown, label = "key"): string {
  const key = assertNonEmptyString(value, label);
  if (FORBIDDEN_KEYS.has(key)) {
    throw new IpcValidationError(`${label} is not allowed`);
  }
  if (!SAFE_KEY_RE.test(key)) {
    throw new IpcValidationError(
      `${label} contains invalid characters (allowed: A-Z a-z 0-9 _)`,
    );
  }
  return key;
}

/**
 * Theme values accepted by the renderer contract (`src/shared/ipc.ts`).
 *
 * NOTE: issue #28 mentions the literal union `'light' | 'dark'`, but the live
 * IPC contract and the renderer also use `'system'` (OS-follow mode). Rejecting
 * `'system'` would break a legitimate call, so the guard accepts the full
 * contract union and rejects everything else.
 */
const THEME_VALUES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEME_VALUES)[number];

/** Validates that a value is one of the allowed theme literals. */
export function assertTheme(value: unknown): Theme {
  if (
    typeof value !== "string" ||
    !(THEME_VALUES as readonly string[]).includes(value)
  ) {
    throw new IpcValidationError(
      `theme must be one of: ${THEME_VALUES.join(", ")}`,
    );
  }
  return value as Theme;
}

/** Allowed characters for a renderer-supplied log-stream subscription id. */
const SUB_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Validates a `docker:logs` subscription id. */
export function assertSubId(value: unknown): string {
  const subId = assertNonEmptyString(value, "subId");
  // Bound the length so a hostile renderer cannot use the id (which becomes an
  // IPC channel name and a Map key) as an unbounded-memory vector.
  if (subId.length > 128) {
    throw new IpcValidationError("subId is too long");
  }
  if (!SUB_ID_RE.test(subId)) {
    throw new IpcValidationError(
      "subId contains invalid characters (allowed: A-Z a-z 0-9 _ -)",
    );
  }
  return subId;
}

/**
 * Canonical set of Docker services this app orchestrates, mirroring
 * `docker-compose.yml`. The orchestrator accepts either the bare service name
 * (`backend`) or the prefixed container name (`datapilot-backend`), so both
 * forms are allowed here.
 */
const KNOWN_SERVICES: ReadonlySet<string> = new Set([
  "neo4j",
  "backend",
  "mcap-parser",
  "rosbag-reader",
  "trajectory-analyzer",
  "planner-failure-inspector",
  "anomaly-detector",
  "report-composer",
]);

/**
 * Validates that a value names one of the known Docker services, accepting
 * either the bare or the `datapilot-`-prefixed form. Returns the value
 * unchanged (the orchestrator does its own normalization).
 */
export function assertKnownService(value: unknown): string {
  const service = assertNonEmptyString(value, "service");
  const bare = service.startsWith("datapilot-")
    ? service.slice("datapilot-".length)
    : service;
  if (!KNOWN_SERVICES.has(bare)) {
    throw new IpcValidationError(`unknown service: ${service}`);
  }
  return service;
}

/**
 * File extensions that are executable or otherwise unsafe to hand to the OS
 * "open" handler. Matched case-insensitively against the canonicalized path's
 * extension (see `isUnsafeOpenTarget`).
 */
const UNSAFE_OPEN_EXTENSIONS: ReadonlySet<string> = new Set([
  ".app",
  ".sh",
  ".command",
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scpt",
  ".scptd",
  ".zsh",
  ".bash",
  ".ksh",
  ".csh",
  ".fish",
  ".ps1",
  ".psm1",
  ".vbs",
  ".vbe",
  ".js",
  ".mjs",
  ".cjs",
  ".jse",
  ".wsf",
  ".wsh",
  ".msi",
  ".msp",
  ".reg",
  ".pkg",
  ".dmg",
  ".jar",
  ".applescript",
  ".action",
  ".workflow",
  ".terminal",
]);

/**
 * Returns true if the (already canonicalized) path has an extension that should
 * never be passed to `shell.openPath` because the OS may execute it.
 *
 * Note the `.app`/`.scptd`/`.workflow` bundles are directories; a path *inside*
 * such a bundle is also rejected by checking every segment for an unsafe
 * extension.
 */
export function isUnsafeOpenTarget(canonicalPath: string): boolean {
  const lower = canonicalPath.toLowerCase();
  // Reject if any path segment ends with an unsafe extension (covers both the
  // leaf file and any *.app / *.workflow bundle ancestor in the path).
  const segments = lower.split(/[\\/]+/).filter(Boolean);
  for (const segment of segments) {
    const dot = segment.lastIndexOf(".");
    if (dot <= 0) continue;
    const ext = segment.slice(dot);
    if (UNSAFE_OPEN_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

/**
 * Returns true if `child` is equal to, or nested under, `root`. Both inputs
 * must already be canonicalized (resolved + normalized). Comparison is
 * separator-aware so `/home/userfoo` is NOT considered under `/home/user`.
 */
export function isPathWithinRoot(
  child: string,
  root: string,
  separator: string,
): boolean {
  if (child === root) return true;
  const rootWithSep = root.endsWith(separator) ? root : root + separator;
  return child.startsWith(rootWithSep);
}
