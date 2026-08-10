/**
 * Secret handling for the main process.
 *
 * Two concerns live here, kept pure (crypto injected) so they are easy to audit
 * and unit-test:
 *
 *  1. `encodeSecretBlob` / `decodeSecretBlob` — how an API key is stored at rest
 *     in `settings.json`. Issue #40: the previous code silently fell back to
 *     plain base64 when `safeStorage` was unavailable and the reader *guessed*
 *     the encoding from the current availability flag. We now (a) tag encrypted
 *     blobs with a marker and (b) refuse to persist a key at all when encryption
 *     is unavailable, instead of writing recoverable base64.
 *
 *  2. `serializeSecretsFile` — the JSON written to a mode-0600 file that is
 *     bind-mounted read-only into the backend container (issues #39, #32). This
 *     replaces both the renderer→HTTP key POST and the `Env`-injected keys
 *     (which were readable via `docker inspect`).
 */

/** Minimal subset of Electron `safeStorage` these helpers depend on. */
export interface SecretCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** Marker prefix identifying a `safeStorage`-encrypted blob (vs. legacy). */
const ENC_PREFIX = "v1:enc:";

/**
 * Provider keychain ids that hold secret API keys, in a stable order. These are
 * the renderer-facing provider names; the backend maps them to its settings
 * fields (e.g. `google` → `gemini_api_key`).
 */
export const SECRET_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "nvidia",
] as const;

export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

/**
 * Encodes a plaintext secret for at-rest storage. Returns a tagged, encrypted
 * blob. Throws if `safeStorage` encryption is unavailable — we never silently
 * persist a recoverable (base64) secret (issue #40).
 */
export function encodeSecretBlob(plaintext: string, crypto: SecretCrypto): string {
  if (!crypto.isEncryptionAvailable()) {
    throw new Error(
      "Secure storage (OS keychain) is unavailable; refusing to store the API key unencrypted.",
    );
  }
  return ENC_PREFIX + crypto.encryptString(plaintext).toString("base64");
}

/**
 * Decodes a stored secret blob back to plaintext.
 *
 * - Tagged (`v1:enc:`) blobs are decrypted; if encryption is unavailable or the
 *   blob is corrupt, this throws.
 * - Untagged blobs are legacy values written before the marker existed. We
 *   decode them exactly as the old reader did (decrypt when encryption is
 *   available, otherwise base64→utf8) so existing installs keep working, with a
 *   decrypt→base64 fallback for robustness.
 */
export function decodeSecretBlob(blob: string, crypto: SecretCrypto): string {
  if (blob.startsWith(ENC_PREFIX)) {
    const b64 = blob.slice(ENC_PREFIX.length);
    return crypto.decryptString(Buffer.from(b64, "base64"));
  }

  // Legacy untagged blob.
  const buf = Buffer.from(blob, "base64");
  if (crypto.isEncryptionAvailable()) {
    try {
      return crypto.decryptString(buf);
    } catch {
      // Fall through: value may predate encryption being available.
    }
  }
  return buf.toString("utf-8");
}

/**
 * Serializes the provider→key map to the JSON written into the backend secret
 * file. Only non-empty (trimmed) keys are included; output key order is sorted
 * so the file content is deterministic (avoids spurious rewrites).
 */
export function serializeSecretsFile(
  keys: Record<string, string | null | undefined>,
): string {
  const out: Record<string, string> = {};
  for (const provider of Object.keys(keys).sort()) {
    const raw = keys[provider];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    out[provider] = trimmed;
  }
  return JSON.stringify(out);
}
