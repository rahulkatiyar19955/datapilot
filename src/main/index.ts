import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { dockerOrchestrator } from "./dockerOrchestrator";
import { registerIpcHandlers } from "./ipcHandlers";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Enable remote debugging port in development mode so AI agents can inspect the app screen
if (process.env.ELECTRON_RENDERER_URL) {
  app.commandLine.appendSwitch("remote-debugging-port", "8315");
}

// Single-instance lock — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: "#15171b", // Match --bg-0
    titleBarStyle: "hidden",
    ...(process.platform === "darwin" && {
      trafficLightPosition: { x: 12, y: 12 },
    }),
    titleBarOverlay:
      process.platform === "win32"
        ? { color: "#15171b", symbolColor: "#9aa3ad", height: 36 }
        : false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Dev: load from Vite dev server; Prod: load packaged index.html.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let isQuitting = false;

app.on("before-quit", (e) => {
  if (!isQuitting) {
    e.preventDefault();
    isQuitting = true;
    console.log("Teardown triggered. Cleaning up Docker stack...");
    dockerOrchestrator
      .ensureStackDown()
      .then(() => {
        console.log("Cleanup completed. Exiting.");
        app.quit();
      })
      .catch((err) => {
        console.error("Teardown failed:", err);
        app.quit();
      });
  }
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // Spin up Docker containers in the background on startup
  void dockerOrchestrator.ensureStackUp();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
