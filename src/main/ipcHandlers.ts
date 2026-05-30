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
import https from "https";
import { Readable } from "stream";
import { dockerOrchestrator } from "./dockerOrchestrator";
import type { DockerStatus, StorageUsage } from "@shared/ipc";

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

function getGoogleDriveId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (url.hostname.includes("drive.google.com") || url.hostname.includes("docs.google.com")) {
      const fileMatch = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileMatch) return fileMatch[1];
      const id = url.searchParams.get("id");
      if (id) return id;
    }
  } catch {}
  return null;
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
    async (event, subId: string, service: string): Promise<void> => {
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
    async (_event, subId: string): Promise<void> => {
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

  ipcMain.handle(
    "file:downloadSampleBag",
    async (event, urlStr: string, reqId: string): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return null;

      try {
        const cacheDir = path.join(app.getPath("userData"), "samples");
        fs.mkdirSync(cacheDir, { recursive: true });

        // Check if it's a Google Drive link
        const gDriveId = getGoogleDriveId(urlStr);

        if (gDriveId) {
          // Cross-check cache for Google Drive file
          const files = fs.readdirSync(cacheDir);
          const cachedFile = files.find((f) => f.startsWith(`${gDriveId}_`));
          if (cachedFile) {
            const destPath = path.join(cacheDir, cachedFile);
            if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
              win.webContents.send(`file:download:progress:${reqId}`, 100);
              return destPath;
            }
          }
        } else {
          // For non-GDrive files, cross-check cache based on URL hash or filename
          const url = new URL(urlStr);
          const fileName = path.basename(url.pathname) || "sample.mcap";
          const destPath = path.join(cacheDir, fileName);
          if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            win.webContents.send(`file:download:progress:${reqId}`, 100);
            return destPath;
          }
        }

        let downloadUrl = urlStr;
        let fetchOptions: RequestInit = {};

        if (gDriveId) {
          downloadUrl = `https://drive.google.com/uc?export=download&id=${gDriveId}`;
          let response = await fetch(downloadUrl);
          const contentType = response.headers.get("content-type") || "";

          if (contentType.includes("text/html")) {
            const html = await response.text();
            const formMatch = html.match(/<form id="download-form" action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/);
            
            if (formMatch) {
              const action = formMatch[1];
              const inputsHtml = formMatch[2];
              
              const queryParams: string[] = [];
              const inputRegex = /<input type="hidden" name="([^"]+)" value="([^"]+)"/g;
              let match;
              while ((match = inputRegex.exec(inputsHtml)) !== null) {
                queryParams.push(`${encodeURIComponent(match[1])}=${encodeURIComponent(match[2])}`);
              }
              
              downloadUrl = `${action}?${queryParams.join("&")}`;
              const cookies = response.headers.getSetCookie();
              const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
              fetchOptions = {
                headers: {
                  Cookie: cookieHeader,
                },
              };
            } else {
              throw new Error("Could not find Google Drive confirmation form in response page");
            }
          }
        }

        const response = await fetch(downloadUrl, fetchOptions);
        if (!response.ok) {
          throw new Error(`Failed to download: ${response.statusText}`);
        }

        let fileName = "sample.mcap";
        if (gDriveId) {
          const cd = response.headers.get("content-disposition");
          if (cd) {
            const match = cd.match(/filename="?([^";]+)"?/);
            if (match) fileName = match[1];
          }
          fileName = `${gDriveId}_${fileName}`;
        } else {
          const url = new URL(urlStr);
          fileName = path.basename(url.pathname) || "sample.mcap";
        }

        const destPath = path.join(cacheDir, fileName);
        const totalBytes = parseInt(response.headers.get("content-length") || "0", 10);
        let downloadedBytes = 0;

        const fileStream = fs.createWriteStream(destPath);
        if (!response.body) {
          throw new Error("Response body is not readable");
        }

        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && !win.isDestroyed()) {
            const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            win.webContents.send(`file:download:progress:${reqId}`, progress);
          }
        });

        nodeStream.pipe(fileStream);

        await new Promise((resolve, reject) => {
          fileStream.on("finish", () => {
            fileStream.close();
            resolve(destPath);
          });
          nodeStream.on("error", (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
          fileStream.on("error", (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });

        return destPath;
      } catch (err) {
        console.error("file:downloadSampleBag error:", err);
        return null;
      }
    },
  );

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
    async (_event, theme: "dark" | "light" | "system"): Promise<void> => {
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
    async (_event, key: string): Promise<string | null> => {
      const settings = readSettings();
      return settings[key] || null;
    },
  );

  ipcMain.handle(
    "settings:set",
    async (_event, key: string, value: string): Promise<void> => {
      const settings = readSettings();
      settings[key] = value;
      writeSettings(settings);
    },
  );

  // Secure keychain storage via safeStorage
  ipcMain.handle(
    "keychain:get",
    async (_event, key: string): Promise<string | null> => {
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
    async (_event, key: string, value: string): Promise<void> => {
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

  // Shell support
  ipcMain.handle(
    "shell:openPath",
    async (_event, pathStr: string): Promise<void> => {
      await shell.openPath(pathStr);
    },
  );

  ipcMain.handle(
    "storage:usage",
    async (_event, targetPath: string): Promise<StorageUsage> => {
      return getPathUsage(targetPath);
    },
  );
}
