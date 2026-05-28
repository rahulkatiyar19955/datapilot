import { useEffect, useRef } from 'react'
import { useSessionStore, setTopicsData } from '@renderer/stores/session'
import { useChatStore } from '@renderer/stores/chat'
import { MOCK_CHAT_MESSAGES } from '@renderer/services/mockData'
import * as api from '@renderer/services/api'


/**
 * Drives the session lifecycle when a bag path is provided.
 * - Creates the backend session.
 * - Polls until status === 'ready'.
 * - Fetches all tab data in parallel once ready.
 *
 * Guard: if the store already has a ready session for the same path,
 * this hook is a no-op (handles navigate-away-and-back without refetch).
 */
export function useSession(pendingPath: string | null): void {
  const { setSession, setStatus, setTabData, clearSession } =
    useSessionStore()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingPath) return

    // No-op if already ready for this path — read current status from store
    // directly to avoid a stale closure from render time.
    if (pendingPath === pathRef.current && useSessionStore.getState().status === 'ready') return

    pathRef.current = pendingPath
    clearSession()
    setStatus('creating')

    let cancelled = false

    const start = async () => {
      try {
        const { session_id } = await api.createSession(pendingPath)
        if (cancelled) return

        const meta = await api.getSession(session_id)
        if (cancelled) return
        setSession(session_id, meta)
        setStatus('processing')

        // Poll until ready
        const poll = async () => {
          if (cancelled) return
          try {
            const updated = await api.getSession(session_id)
            if (cancelled) return

            if (updated.status === 'ready') {
              setSession(session_id, updated)
              setStatus('ready')

              // Fetch all tab data in parallel
              const [timeline, topics, logs, kgraph] = await Promise.allSettled([
                api.getTimeline(session_id),
                api.getTopics(session_id),
                api.getLogs(session_id),
                api.getKGraph(session_id),
              ])

              if (cancelled) return

              if (timeline.status === 'fulfilled') setTabData('timeline', timeline.value)
              if (topics.status === 'fulfilled') setTopicsData(topics.value)
              if (logs.status === 'fulfilled') setTabData('logs', logs.value)
              if (kgraph.status === 'fulfilled') setTabData('kgraph', kgraph.value)

              // MOCK SEED: for phase 6 visual diff
              if (session_id === 'run-1042') {
                console.log('SETTING MOCK CHAT MESSAGES:', MOCK_CHAT_MESSAGES)
                useChatStore.setState({ messages: MOCK_CHAT_MESSAGES })
              }
            } else if (updated.status === 'error') {
              setStatus('error')
            } else {
              timeoutRef.current = setTimeout(() => { void poll() }, 1500)
            }
          } catch {
            if (!cancelled) setStatus('error')
          }
        }

        void poll()
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void start()

    return () => {
      cancelled = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [pendingPath]) // eslint-disable-line react-hooks/exhaustive-deps
}
