import { useEffect } from 'react'
import { useUIStore } from '@renderer/stores/ui'

export function useGlobalShortcut(): void {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setSearchOpen])
}
