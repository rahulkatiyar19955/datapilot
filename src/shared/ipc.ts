/**
 * Typed IPC contracts shared by main, preload, and renderer.
 *
 * Phase 0 stub — channels added as their producing phase lands.
 *
 * Convention:
 *   - Channel names follow `<namespace>:<verb>` (e.g. `docker:status`).
 *   - Request and response shapes are declared here.
 *   - Preload exposes a strongly-typed `window.datapilot.*` surface.
 *
 * Future channels (planned, not yet wired):
 *   - docker:status, docker:retry         (Phase 1)
 *   - file:pickBag                         (Phase 1)
 *   - theme:get, theme:set                 (Phase 1 / 2)
 *   - settings:get, settings:set           (Phase 4)
 *   - keychain:get, keychain:set           (Phase 4 — safeStorage)
 *   - shell:openPath                       (Phase 11)
 */

export type DockerStatus =
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'error'; code: DockerErrorCode; message: string }

export type DockerErrorCode =
  | 'daemon_off'
  | 'permission_denied'
  | 'image_pull_failed'
  | 'port_conflict'
  | 'unknown'

export interface DatapilotApi {
  /** Returns the current Electron app version. Available immediately, no Docker required. */
  app: {
    version(): Promise<string>
    platform(): Promise<NodeJS.Platform>
  }
}

declare global {
  interface Window {
    datapilot: DatapilotApi
  }
}

export {}
