import { create } from 'zustand'
import { clearAllSessions, updateBackendKey } from '@renderer/services/api'


export const ACCENT_PRESETS = [
  { color: 'oklch(0.74 0.17 235)', label: 'Electric' },
  { color: 'oklch(0.78 0.17 150)', label: 'Lime' },
  { color: 'oklch(0.70 0.18 330)', label: 'Magenta' },
  { color: 'oklch(0.80 0.15 80)',  label: 'Amber' },
  { color: 'oklch(0.70 0.20 25)',  label: 'Crimson' },
] as const

interface SettingsState {
  accentColor: string
  uiDensity: string
  monoFreq: boolean
  telemetryUsage: boolean
  telemetryCrash: boolean
  defaultProvider: string
  defaultModel: string
  embeddingModel: string
  apiKeys: Record<string, string>
  dockerSocket: string
  tlsCertPath: string
  defaultRosImage: string
  gpuPassthrough: boolean
  concurrentWorkers: number
  autoTeardownAfter: string
  cacheDir: string
  bagArchiveRoot: string
  autoIndexBags: boolean
  chunkWindow: string
  updateChannel: string
  loading: boolean

  loadSettings: () => Promise<void>
  setSetting: (key: string, value: string | boolean | number) => Promise<void>
  setApiKey: (provider: string, value: string) => Promise<void>
  resetSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  accentColor: 'Electric',
  uiDensity: 'Comfortable',
  monoFreq: true,
  telemetryUsage: false,
  telemetryCrash: true,
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4.5',
  embeddingModel: 'voyage-3 (Anthropic)',
  apiKeys: {
    anthropic: '',
    openai: '',
    google: '',
    ollama: '',
    custom: '',
  },
  dockerSocket: '',
  tlsCertPath: '',
  defaultRosImage: 'osrf/ros:humble-desktop',
  gpuPassthrough: true,
  concurrentWorkers: 4,
  autoTeardownAfter: '2 minutes',
  cacheDir: '',
  bagArchiveRoot: '~/datapilot/bags',
  autoIndexBags: true,
  chunkWindow: '5 sec',
  updateChannel: 'Stable',
  loading: false,

  loadSettings: async () => {
    if (!window.datapilot) return
    set({ loading: true })

    try {
      const platform = await window.datapilot.app.platform()
      const isWin = platform === 'win32'
      const defaultSocket = isWin ? '\\\\.\\pipe\\docker_engine' : '/var/run/docker.sock'
      const [userDataPath, homePath] = await Promise.all([
        window.datapilot.app.userDataPath(),
        window.datapilot.app.homePath(),
      ])
      const defaultCache = userDataPath
      const defaultBagArchiveRoot = isWin
        ? `${homePath}\\datapilot\\bags`
        : `${homePath}/datapilot/bags`

      const getStr = async (key: string, def: string) => {
        const val = await window.datapilot.settings.get(key)
        return val === null || val === '' ? def : val
      }
      const getBool = async (key: string, def: boolean) => {
        const val = await window.datapilot.settings.get(key)
        return val !== null && val !== '' ? val === 'true' : def
      }
      const getNum = async (key: string, def: number) => {
        const val = await window.datapilot.settings.get(key)
        return val !== null && val !== '' ? parseInt(val, 10) : def
      }

      const accentColor = await getStr('accent_color', 'Electric')
      const uiDensity = await getStr('ui_density', 'Comfortable')
      const monoFreq = await getBool('mono_freq', true)
      const telemetryUsage = await getBool('telemetry_usage', false)
      const telemetryCrash = await getBool('telemetry_crash', true)
      const defaultProvider = await getStr('default_provider', 'anthropic')
      const defaultModel = await getStr('default_model', 'claude-sonnet-4.5')
      const embeddingModel = await getStr('embedding_model', 'voyage-3 (Anthropic)')
      const dockerSocket = await getStr('docker_socket', defaultSocket)
      const tlsCertPath = await getStr('tls_cert_path', '')
      const defaultRosImage = await getStr('default_ros_image', 'osrf/ros:humble-desktop')
      const gpuPassthrough = await getBool('gpu_passthrough', true)
      const concurrentWorkers = await getNum('concurrent_workers', 4)
      const autoTeardownAfter = await getStr('auto_teardown_after', '2 minutes')
      const cacheDir = await getStr('cache_dir', defaultCache)
      const bagArchiveRoot = await getStr('bag_archive_root', defaultBagArchiveRoot)
      const autoIndexBags = await getBool('auto_index_bags', true)
      const chunkWindow = await getStr('chunk_window', '5 sec')
      const updateChannel = await getStr('update_channel', 'Stable')

      const apiKeys: Record<string, string> = {}
      for (const p of ['anthropic', 'openai', 'google', 'ollama', 'custom']) {
        apiKeys[p] = (await window.datapilot.keychain.get(p)) ?? ''
      }

      set({
        accentColor,
        uiDensity,
        monoFreq,
        telemetryUsage,
        telemetryCrash,
        defaultProvider,
        defaultModel,
        embeddingModel,
        dockerSocket,
        tlsCertPath,
        defaultRosImage,
        gpuPassthrough,
        concurrentWorkers,
        autoTeardownAfter,
        cacheDir,
        bagArchiveRoot,
        autoIndexBags,
        chunkWindow,
        updateChannel,
        apiKeys,
        loading: false,
      })

      // Sync loaded API keys with backend container on startup
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key) {
          try {
            await updateBackendKey(provider, key)
          } catch (err) {
            console.error(`Failed to sync API key for ${provider} to backend:`, err)
          }
        }
      }

      // Apply accent color
      const preset = ACCENT_PRESETS.find(p => p.label === accentColor)
      if (preset) {
        document.documentElement.style.setProperty('--color-accent', preset.color)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      set({ loading: false })
    }
  },

  setSetting: async (key: string, value: string | boolean | number) => {
    if (!window.datapilot) return

    // Map store key camelCase to setting key snake_case
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    
    // Optimistic update
    set({ [key]: value } as any)

    try {
      await window.datapilot.settings.set(dbKey, String(value))
      
      // Special case: apply accent color change immediately
      if (key === 'accentColor') {
        const preset = ACCENT_PRESETS.find(p => p.label === value)
        if (preset) {
          document.documentElement.style.setProperty('--color-accent', preset.color)
        }
      }
    } catch (err) {
      console.error(`Failed to save setting ${key}:`, err)
    }
  },

  setApiKey: async (provider: string, value: string) => {
    if (!window.datapilot) return

    set((state) => ({
      apiKeys: {
        ...state.apiKeys,
        [provider]: value,
      },
    }))

    try {
      await window.datapilot.keychain.set(provider, value)
      // Sync API key to backend container at runtime
      await updateBackendKey(provider, value)
    } catch (err) {
      console.error(`Failed to save API key for ${provider}:`, err)
    }
  },

  resetSettings: async () => {
    if (!window.datapilot) return
    set({ loading: true })

    try {
      // Clear backend sessions
      try {
        await clearAllSessions()
      } catch (err) {
        console.error('Failed to clear backend sessions during reset:', err)
      }

      // Clear all keys from settings.json by saving empty strings or resetting defaults
      const keysToReset = [
        'accent_color', 'ui_density', 'mono_freq', 'telemetry_usage', 'telemetry_crash',
        'default_provider', 'default_model', 'embedding_model', 'docker_socket', 'tls_cert_path',
        'default_ros_image', 'gpu_passthrough', 'concurrent_workers', 'auto_teardown_after',
        'cache_dir', 'bag_archive_root', 'auto_index_bags', 'chunk_window', 'update_channel'
      ]

      for (const k of keysToReset) {
        await window.datapilot.settings.set(k, '')
      }

      for (const p of ['anthropic', 'openai', 'google', 'ollama', 'custom']) {
        await window.datapilot.keychain.set(p, '')
        try {
          await updateBackendKey(p, '')
        } catch (err) {
          console.error(`Failed to clear API key for ${p} on backend:`, err)
        }
      }

      // Reload defaults
      await get().loadSettings()
    } catch (err) {
      console.error('Failed to reset settings:', err)
      set({ loading: false })
    }
  },
}))
