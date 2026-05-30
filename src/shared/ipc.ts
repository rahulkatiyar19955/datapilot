/**
 * Typed IPC contracts shared by main, preload, and renderer.
 *
 * Convention:
 *   - Channel names follow `<namespace>:<verb>` (e.g. `docker:status`).
 *   - Request and response shapes are declared here.
 *   - Preload exposes a strongly-typed `window.datapilot.*` surface.
 */

export type DockerStatus =
  | { state: "pending"; progress?: number; step?: string }
  | { state: "ready" }
  | { state: "error"; code: DockerErrorCode; message: string };

export type DockerErrorCode =
  | "daemon_off"
  | "permission_denied"
  | "image_pull_failed"
  | "port_conflict"
  | "unknown";

export interface StorageUsage {
  path: string;
  resolvedPath: string;
  exists: boolean;
  totalBytes: number;
  fileCount: number;
}

export interface DatapilotApi {
  /** Returns the current Electron app version and platform info. Available immediately. */
  app: {
    version(): Promise<string>;
    platform(): Promise<NodeJS.Platform>;
    userDataPath(): Promise<string>;
    homePath(): Promise<string>;
  };
  /** Controls and monitors the local Docker services stack. */
  docker: {
    status(): Promise<DockerStatus>;
    retry(): Promise<void>;
    onStatusChanged(callback: (status: DockerStatus) => void): () => void;
    /**
     * Streams logs from a service container (e.g. "backend" or "datapilot-backend").
     * Returns an unsubscribe function that closes the stream on the main side.
     */
    streamLogs(
      service: string,
      onChunk: (chunk: string) => void,
    ): Promise<() => Promise<void>>;
  };
  /** Prompts user to pick a ROS bag file via native OS dialogs. */
  file: {
    pickBag(): Promise<string | null>;
    /** Downloads a sample bag from a URL to local cache, reporting progress 0-100. */
    downloadSampleBag(
      url: string,
      onProgress: (progress: number) => void,
    ): Promise<string | null>;
  };
  /** Theme preference operations. */
  theme: {
    get(): Promise<"dark" | "light" | "system">;
    set(theme: "dark" | "light" | "system"): Promise<void>;
  };
  /** Local storage settings (e.g., config parameters). */
  settings: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  /** Secure credential storage using Electron's safeStorage. */
  keychain: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  /** Launches file/folder path with host defaults. */
  shell: {
    openPath(path: string): Promise<void>;
  };
  /** Filesystem usage helpers for renderer panels. */
  storage: {
    usage(path: string): Promise<StorageUsage>;
  };
}

declare global {
  interface Window {
    datapilot: DatapilotApi;
  }
}

export {};
