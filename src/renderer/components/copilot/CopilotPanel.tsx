import { useEffect, useRef, type JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { useChatStore } from '@renderer/stores/chat'
import { useSessionStore } from '@renderer/stores/session'
import { ChatMessage } from './ChatMessage'
import { ContextChips } from './ContextChips'
import { CommandBar } from './CommandBar'

export function CopilotPanel(): JSX.Element {
  const messages = useChatStore((s) => s.messages)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const { status, clearSession, setPendingPath, pendingPath } = useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * "New session" — clears the chat AND resets the session entirely so the
   * user lands on the idle workspace ready to load a fresh bag.
   * This also aborts any in-flight session creation (via the useSession
   * cleanup that fires when pendingPath becomes null).
   */
  const handleNewSession = () => {
    clearMessages()
    clearSession()
    setPendingPath(null)
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const modelLabel = 'claude-sonnet-4.5'

  return (
    <div
      className="col"
      style={{
        width: 420,
        flexShrink: 0,
        background: 'var(--color-bg-1)',
        borderRight: '1px solid var(--color-border-1)',
        minHeight: 0,
      }}
    >
      {/* Panel header */}
      <div
        className="row"
        style={{
          height: 44,
          padding: '0 14px',
          borderBottom: '1px solid var(--color-border-1)',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <Icon.Sparkles size={15} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-0)' }}>
          Copilot
        </span>
        <span className="pill sm ghost mono">{modelLabel}</span>
        <div className="flex1" />
        <button
          className="btn ghost icon sm"
          title="New session"
          onClick={handleNewSession}
        >
          <Icon.Plus size={13} />
        </button>
        <button className="btn ghost icon sm" title="History" disabled>
          <Icon.Clock size={13} />
        </button>
      </div>

      {/* Context chips */}
      <ContextChips />

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex1"
        style={{ overflowY: 'auto', padding: '8px 0' }}
      >
        {messages.length === 0 && status !== 'idle' && (
          <div
            className="col"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              padding: '24px 20px',
            }}
          >
            {status === 'creating' || status === 'processing' ? (
              <>
                <span className="pulse" style={{ color: 'var(--color-accent)' }}>
                  <Icon.Sparkles size={20} />
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-2)', textAlign: 'center' }}>
                  {status === 'creating' ? 'Creating session…' : 'Indexing with AI…'}
                </span>
              </>
            ) : status === 'error' ? (
              <div className="col gap-3 items-center justify-center">
                <span style={{ fontSize: 12, color: 'var(--color-danger)', textAlign: 'center' }}>
                  Failed to load session. Please try again.
                </span>
                <button
                  className="btn primary sm"
                  onClick={() => {
                    const path = pendingPath
                    if (path) {
                      setPendingPath(null)
                      setTimeout(() => {
                        setPendingPath(path)
                      }, 50)
                    }
                  }}
                  title="Retry loading session"
                >
                  <Icon.Refresh size={12} />
                  Retry Loading
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center' }}>
                Session ready. Ask anything about this run.
              </span>
            )}
          </div>
        )}
        {messages.length === 0 && status === 'idle' && (
          <div
            style={{
              padding: '32px 20px',
              textAlign: 'center',
              color: 'var(--color-text-3)',
              fontSize: 12,
            }}
          >
            Load a ROS bag to begin analysis.
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Quick-action chips */}
      <div style={{ padding: '8px 14px 4px', flexShrink: 0 }}>
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Upload size={11} /> Upload rosbag
          </button>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Wifi size={11} /> Connect live robot
          </button>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Search size={11} /> Search past runs
          </button>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Layers size={11} /> Compare releases
          </button>
        </div>
      </div>

      {/* Command bar */}
      <CommandBar />
    </div>
  )
}
