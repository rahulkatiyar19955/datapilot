import { ipcMain, dialog, safeStorage, shell, app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { dockerOrchestrator } from './dockerOrchestrator'
import type { DockerStatus } from '@shared/ipc'

// Active log-stream unsubscribe callbacks, keyed by per-renderer subscription id.
const activeLogStreams = new Map<string, () => void>()

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

// Simple file-backed settings store
function readSettings(): Record<string, string> {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
  } catch (err) {
    console.error('Failed to read settings:', err)
  }
  return {}
}

function writeSettings(settings: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to write settings:', err)
  }
}

export function registerIpcHandlers(): void {
  // App version / platform (already registered in scaffold, here for completeness)
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)

  // Docker orchestrator handlers
  ipcMain.handle('docker:status', async (): Promise<DockerStatus> => {
    return dockerOrchestrator.getStatus()
  })

  ipcMain.handle('docker:retry', async (): Promise<void> => {
    // Triggers boot in the background; updates will stream via status events
    void dockerOrchestrator.ensureStackUp()
  })

  // Stream container logs back to the requesting renderer. The renderer supplies
  // a unique `subId`; chunks arrive on `docker:logs:chunk:<subId>` and the
  // renderer calls `docker:logs:stop` with the same subId to close the stream.
  ipcMain.handle(
    'docker:logs:start',
    async (event, subId: string, service: string): Promise<void> => {
      // If the renderer reuses a subId, close the prior stream first.
      activeLogStreams.get(subId)?.()
      activeLogStreams.delete(subId)

      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return

      try {
        const unsubscribe = await dockerOrchestrator.streamLogs(service, (chunk) => {
          if (!win.isDestroyed()) {
            win.webContents.send(`docker:logs:chunk:${subId}`, chunk)
          }
        })

        // Close the stream automatically if the requesting window is closed.
        const cleanup = () => {
          unsubscribe()
          activeLogStreams.delete(subId)
        }
        win.once('closed', cleanup)
        activeLogStreams.set(subId, cleanup)
      } catch (err) {
        console.error(`docker:logs:start failed for ${service}:`, err)
        win.webContents.send(`docker:logs:chunk:${subId}`, `\n[stream error: ${(err as Error).message}]\n`)
      }
    },
  )

  ipcMain.handle('docker:logs:stop', async (_event, subId: string): Promise<void> => {
    activeLogStreams.get(subId)?.()
    activeLogStreams.delete(subId)
  })

  // File Picker
  ipcMain.handle('file:pickBag', async (_event): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: 'Select ROS Bag File',
      properties: ['openFile'],
      filters: [
        { name: 'ROS Bags (*.mcap, *.db3, *.bag)', extensions: ['mcap', 'db3', 'bag'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // Theme support
  ipcMain.handle('theme:get', async (): Promise<'dark' | 'light' | 'system'> => {
    const settings = readSettings()
    return (settings['theme'] as 'dark' | 'light' | 'system') || 'system'
  })

  ipcMain.handle('theme:set', async (_event, theme: 'dark' | 'light' | 'system'): Promise<void> => {
    const settings = readSettings()
    settings['theme'] = theme
    writeSettings(settings)

    // Sync OS-level title-bar styling on macOS.
    if (process.platform === 'darwin') {
      for (const win of BrowserWindow.getAllWindows()) {
        win.setWindowButtonVisibility(true)
      }
    }
  })

  // Settings support
  ipcMain.handle('settings:get', async (_event, key: string): Promise<string | null> => {
    const settings = readSettings()
    return settings[key] || null
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: string): Promise<void> => {
    const settings = readSettings()
    settings[key] = value
    writeSettings(settings)
  })

  // Secure keychain storage via safeStorage
  ipcMain.handle('keychain:get', async (_event, key: string): Promise<string | null> => {
    const settings = readSettings()
    const encryptedValue = settings[`secure_${key}`]
    if (!encryptedValue) return null

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const decryptedBuffer = safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'))
        return decryptedBuffer
      } else {
        // Fallback if encryption is not supported (e.g. headless/mock env)
        return Buffer.from(encryptedValue, 'base64').toString('utf-8')
      }
    } catch (err) {
      console.error(`Failed to decrypt key: ${key}`, err)
      return null
    }
  })

  ipcMain.handle('keychain:set', async (_event, key: string, value: string): Promise<void> => {
    const settings = readSettings()
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encryptedBase64 = safeStorage.encryptString(value).toString('base64')
        settings[`secure_${key}`] = encryptedBase64
      } else {
        // Fallback if encryption is not supported
        settings[`secure_${key}`] = Buffer.from(value, 'utf-8').toString('base64')
      }
      writeSettings(settings)
    } catch (err) {
      console.error(`Failed to encrypt key: ${key}`, err)
    }
  })

  // Shell support
  ipcMain.handle('shell:openPath', async (_event, pathStr: string): Promise<void> => {
    await shell.openPath(pathStr)
  })
}
