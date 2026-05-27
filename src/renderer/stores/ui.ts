import { create } from 'zustand'
import type { ScreenName, WorkspaceTab } from '@shared/types'

interface UIState {
  screen: ScreenName
  tab: WorkspaceTab
  selectedEventT: number | null
  searchOpen: boolean

  setScreen: (screen: ScreenName) => void
  setTab: (tab: WorkspaceTab) => void
  setSelectedEventT: (t: number | null) => void
  setSearchOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  screen: 'copilot',
  tab: 'timeline',
  selectedEventT: null,
  searchOpen: false,

  setScreen: (screen) => set({ screen }),
  setTab: (tab) => set({ tab }),
  setSelectedEventT: (selectedEventT) => set({ selectedEventT }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}))
