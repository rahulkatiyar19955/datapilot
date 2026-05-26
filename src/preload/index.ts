import { contextBridge, ipcRenderer } from 'electron'
import type { DatapilotApi } from '@shared/ipc'

/**
 * Narrow API surface exposed to the renderer.
 * The renderer cannot reach `ipcRenderer` directly — everything goes through this object.
 */
const api: DatapilotApi = {
  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>,
    platform: () => ipcRenderer.invoke('app:platform') as Promise<NodeJS.Platform>,
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('datapilot', api)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to expose preload API:', err)
  }
} else {
  // contextIsolation disabled — should never happen in this app, but degrade safely.
  // @ts-expect-error attaching to window when isolation is off
  window.datapilot = api
}
