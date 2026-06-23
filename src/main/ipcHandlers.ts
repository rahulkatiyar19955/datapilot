import {
  ipcMain,
  dialog,
  safeStorage,
  shell,
  app,
  BrowserWindow,
} from "electron";
import fs from "fs";
import path from "path";
import { dockerOrchestrator } from "./dockerOrchestrator";
import type { DockerStatus, StorageUsage } from "@shared/ipc";
import {
  IpcValidationError,
  assertKnownService,
  assertSafeKey,
  assertString,
  assertSubId,
  assertTheme,
  isPathWithinRoot,
  isUnsafeOpenTarget,
} from "./ipcValidation";

// Active log-stream unsubscribe callbacks, keyed by per-renderer subscription id.
const activeLogStreams = new Map<string, () => void>();

const settingsPath = path.join(app.getPath("userData"), "settings.json");

// Simple file-backed settings store.
//
// If the settings file is unreadable or malformed, we rotate it to `.bak`
// before returning empty. Otherwise the next writeSettings() would silently
// overwrite a partially-recoverable file (including encrypted API keys) with
// just the one key the caller is setting — irreversible data loss.
function readSettings(): Record<string, string> {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch (err) {
    console.error("Failed to read settings — rotating to .bak:", err);
    try {
      fs.renameSync(settingsPath, `${settingsPath}.bak.${Date.now()}`);
    } catch (renameErr) {
      console.error("Failed to rotate corrupted settings file:", renameErr);
    }
    return {};
  }
}

function writeSettings(settings: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write settings:", err);
  }
}

function resolveUserPath(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (inputPath === "~") return app.getPath("home");
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(app.getPath("home"), inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

/**
 * Validates a renderer-supplied path for `shell:openPath` (issue #27).
 *
 * The renderer only ever needs to reveal/open the user's own data: the
 * userData directory (logs/settings), the home directory, and the selected bag
 * or its containing folder (which live under home). We therefore:
 *   1. require a string,
 *   2. canonicalize it (resolve `~`, `..`, symlinks) via realpath,
 *   3. require it to exist,
 *   4. reject executable / app-bundle extensions,
 *   5. constrain it to the expected roots (userData, home).
 *
 * Returns the canonical path plus whether it is a directory; throws
 * `IpcValidationError` on any violation.
 */
function validateOpenPath(value: unknown): {
  canonicalPath: string;
  isDirectory: boolean;
} {
  const raw = assertString(value, "path");
  if (raw.length === 0) {
    throw new IpcValidationError("path must not be empty");
  }

  // Resolve `~` and relative segments first, then canonicalize through the
  // filesystem so symlinks cannot escape the allowed roots.
  const resolved = resolveUserPath(raw);

  let canonicalPath: string;
  let stats: fs.Stats;
  try {
    canonicalPath = fs.realpathSync(resolved);
    stats = fs.statSync(canonicalPath);
  } catch {
    // Non-existent path, broken symlink, or permission error — reject without
    // leaking filesystem details to the renderer.
    throw new IpcValidationError("path does not exist or is not accessible");
  }

  if (isUnsafeOpenTarget(canonicalPath)) {
    throw new IpcValidationError("refusing to open an executable path");
  }

  // Canonicalize the allowed roots too, so symlinked userData/home dirs match.
  const allowedRoots: string[] = [];
  for (const root of [app.getPath("userData"), app.getPath("home")]) {
    try {
      allowedRoots.push(fs.realpathSync(root));
    } catch {
      allowedRoots.push(path.resolve(root));
    }
  }

  const withinRoot = allowedRoots.some((root) =>
    isPathWithinRoot(canonicalPath, root, path.sep),
  );
  if (!withinRoot) {
    throw new IpcValidationError("path is outside the allowed directories");
  }

  return { canonicalPath, isDirectory: stats.isDirectory() };
}

function getPathUsage(targetPath: string): StorageUsage {
  const resolvedPath = resolveUserPath(targetPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return {
      path: targetPath,
      resolvedPath,
      exists: false,
      totalBytes: 0,
      fileCount: 0,
    };
  }

  let totalBytes = 0;
  let fileCount = 0;

  const walk = (current: string): void => {
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(current);
    } catch {
      return;
    }

    if (stats.isSymbolicLink()) return;
    if (stats.isFile()) {
      totalBytes += stats.size;
      fileCount += 1;
      return;
    }
    if (!stats.isDirectory()) return;

    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      walk(path.join(current, entry));
    }
  };

  walk(resolvedPath);

  return {
    path: targetPath,
    resolvedPath,
    exists: true,
    totalBytes,
    fileCount,
  };
}

export function registerIpcHandlers(): void {
  // App version / platform (already registered in scaffold, here for completeness)
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:platform", () => process.platform);
  ipcMain.handle("app:userDataPath", () => app.getPath("userData"));
  ipcMain.handle("app:homePath", () => app.getPath("home"));

  // Docker orchestrator handlers
  ipcMain.handle("docker:status", async (): Promise<DockerStatus> => {
    return dockerOrchestrator.getStatus();
  });

  ipcMain.handle("docker:retry", async (): Promise<void> => {
    // Triggers boot in the background; updates will stream via status events
    void dockerOrchestrator.ensureStackUp();
  });

  // Stream container logs back to the requesting renderer. The renderer supplies
  // a unique `subId`; chunks arrive on `docker:logs:chunk:<subId>` and the
  // renderer calls `docker:logs:stop` with the same subId to close the stream.
  ipcMain.handle(
    "docker:logs:start",
    async (event, rawSubId: unknown, rawService: unknown): Promise<void> => {
      const subId = assertSubId(rawSubId);
      const service = assertKnownService(rawService);

      // If the renderer reuses a subId, close the prior stream first.
      activeLogStreams.get(subId)?.();
      activeLogStreams.delete(subId);

      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;

      try {
        const unsubscribe = await dockerOrchestrator.streamLogs(
          service,
          (chunk) => {
            if (!win.isDestroyed()) {
              win.webContents.send(`docker:logs:chunk:${subId}`, chunk);
            }
          },
        );

        // Close the stream automatically if the requesting window is closed.
        const cleanup = () => {
          unsubscribe();
          activeLogStreams.delete(subId);
        };
        win.once("closed", cleanup);
        activeLogStreams.set(subId, cleanup);
      } catch (err) {
        console.error(`docker:logs:start failed for ${service}:`, err);
        win.webContents.send(
          `docker:logs:chunk:${subId}`,
          `\n[stream error: ${(err as Error).message}]\n`,
        );
      }
    },
  );

  ipcMain.handle(
    "docker:logs:stop",
    async (_event, rawSubId: unknown): Promise<void> => {
      const subId = assertSubId(rawSubId);
      activeLogStreams.get(subId)?.();
      activeLogStreams.delete(subId);
    },
  );

  // File Picker.
  // Use `fromWebContents(event.sender)` rather than `getFocusedWindow()` — the
  // user can lose focus between clicking the button and the IPC arriving here,
  // which would otherwise return null or the wrong window.
  ipcMain.handle("file:pickBag", async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "Select ROS Bag File",
      properties: ["openFile"],
      filters: [
        {
          name: "ROS Bags (*.mcap, *.db3, *.bag)",
          extensions: ["mcap", "db3", "bag"],
        },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Theme support
  ipcMain.handle(
    "theme:get",
    async (): Promise<"dark" | "light" | "system"> => {
      const settings = readSettings();
      return (settings["theme"] as "dark" | "light" | "system") || "system";
    },
  );

  ipcMain.handle(
    "theme:set",
    async (_event, rawTheme: unknown): Promise<void> => {
      const theme = assertTheme(rawTheme);
      const settings = readSettings();
      settings["theme"] = theme;
      writeSettings(settings);

      // Sync OS-level title-bar styling on macOS.
      if (process.platform === "darwin") {
        for (const win of BrowserWindow.getAllWindows()) {
          win.setWindowButtonVisibility(true);
        }
      }
    },
  );

  // Settings support
  ipcMain.handle(
    "settings:get",
    async (_event, rawKey: unknown): Promise<string | null> => {
      const key = assertSafeKey(rawKey);
      const settings = readSettings();
      return settings[key] || null;
    },
  );

  ipcMain.handle(
    "settings:set",
    async (_event, rawKey: unknown, rawValue: unknown): Promise<void> => {
      const key = assertSafeKey(rawKey);
      const value = assertString(rawValue, "value");
      const settings = readSettings();
      settings[key] = value;
      writeSettings(settings);
    },
  );

  // Secure keychain storage via safeStorage
  ipcMain.handle(
    "keychain:get",
    async (_event, rawKey: unknown): Promise<string | null> => {
      const key = assertSafeKey(rawKey);
      const settings = readSettings();
      const encryptedValue = settings[`secure_${key}`];
      if (!encryptedValue) return null;

      try {
        if (safeStorage.isEncryptionAvailable()) {
          const decryptedBuffer = safeStorage.decryptString(
            Buffer.from(encryptedValue, "base64"),
          );
          return decryptedBuffer;
        } else {
          // Fallback if encryption is not supported (e.g. headless/mock env)
          return Buffer.from(encryptedValue, "base64").toString("utf-8");
        }
      } catch (err) {
        console.error(`Failed to decrypt key: ${key}`, err);
        return null;
      }
    },
  );

  ipcMain.handle(
    "keychain:set",
    async (_event, rawKey: unknown, rawValue: unknown): Promise<void> => {
      const key = assertSafeKey(rawKey);
      const value = assertString(rawValue, "value");
      const settings = readSettings();
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const encryptedBase64 = safeStorage
            .encryptString(value)
            .toString("base64");
          settings[`secure_${key}`] = encryptedBase64;
        } else {
          // Fallback if encryption is not supported
          settings[`secure_${key}`] = Buffer.from(value, "utf-8").toString(
            "base64",
          );
        }
        writeSettings(settings);
      } catch (err) {
        console.error(`Failed to encrypt key: ${key}`, err);
      }
    },
  );

  // Shell support.
  //
  // Issue #27: `shell.openPath` hands a path straight to the OS "open" handler,
  // which will happily execute scripts/apps. We canonicalize and constrain the
  // path to the user's own data roots and reject executable targets. For a file
  // we *reveal* it in its folder (showItemInFolder) rather than opening it,
  // which is the legitimate intent; directories are opened directly.
  ipcMain.handle(
    "shell:openPath",
    async (_event, rawPath: unknown): Promise<void> => {
      const { canonicalPath, isDirectory } = validateOpenPath(rawPath);
      if (isDirectory) {
        const errMessage = await shell.openPath(canonicalPath);
        if (errMessage) {
          throw new IpcValidationError(`failed to open path: ${errMessage}`);
        }
      } else {
        // Reveal the file in its containing folder instead of launching it.
        shell.showItemInFolder(canonicalPath);
      }
    },
  );

  ipcMain.handle(
    "storage:usage",
    async (_event, rawTargetPath: unknown): Promise<StorageUsage> => {
      // Basic type validation only. TODO(#37): add path-containment checks and
      // an async / bounded directory walk to prevent traversal + DoS on a
      // hostile or pathological path. That hardening is tracked separately.
      const targetPath = assertString(rawTargetPath, "path");
      return getPathUsage(targetPath);
    },
  );
}
