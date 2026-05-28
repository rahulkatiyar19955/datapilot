import { useEffect, useRef, useState, type JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { useChatStore } from '@renderer/stores/chat'
import { useSessionStore } from '@renderer/stores/session'
import { ChatMessage } from './ChatMessage'
import { ContextChips } from './ContextChips'
import { CommandBar } from './CommandBar'
import * as api from '@renderer/services/api'
import type { SessionMeta } from '@shared/types'

export function CopilotPanel(): JSX.Element {
  const messages = useChatStore((s) => s.messages)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const { status, clearSession, setPendingPath, pendingPath, setPendingSessionId } = useSessionStore()
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

  const [showHistory, setShowHistory] = useState(false)
  const [historySessions, setHistorySessions] = useState<SessionMeta[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const handleToggleHistory = async () => {
    const nextVal = !showHistory
    setShowHistory(nextVal)
    if (nextVal) {
      setLoadingHistory(true)
      try {
        const data = await api.getSessions()
        setHistorySessions(data)
      } catch (err) {
        console.error('Failed to load sessions history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }
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
          position: 'relative',
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
        <button 
          className={`btn ghost icon sm ${showHistory ? 'primary' : ''}`} 
          title="History" 
          onClick={handleToggleHistory}
        >
          <Icon.Clock size={13} />
        </button>

        {showHistory && (
          <div
            className="card"
            style={{
              position: 'absolute',
              top: 40,
              right: 14,
              width: 320,
              maxHeight: 300,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              background: 'var(--color-bg-2)',
              borderColor: 'var(--color-border-2)',
              overflow: 'hidden',
            }}
          >
            <div
              className="row"
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--color-border-1)',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-0)' }}>
                Session History
              </span>
              <button
                className="btn ghost icon sm"
                style={{ height: 20, width: 20 }}
                onClick={() => setShowHistory(false)}
              >
                <Icon.Check size={12} style={{ color: 'var(--color-ok)' }} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
              {loadingHistory ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>
                  <span className="pulse">Loading history...</span>
                </div>
              ) : historySessions.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>
                  No past sessions found.
                </div>
              ) : (
                historySessions.map((s) => (
                  <div
                    key={s.id}
                    className="row gap-2"
                    style={{
                      padding: '8px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-bg-3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div 
                      className="col flex1" 
                      style={{ minWidth: 0 }}
                      onClick={() => {
                        setPendingSessionId(s.id)
                        setShowHistory(false)
                      }}
                    >
                      <div 
                        style={{ 
                          fontWeight: 500, 
                          color: 'var(--color-text-1)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={s.filename}
                      >
                        {s.filename}
                      </div>
                      <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {s.robot} · {s.durationSeconds.toFixed(1)}s · {s.status}
                      </div>
                    </div>
                    <button
                      className="btn ghost icon sm"
                      style={{ height: 24, width: 24, color: 'var(--color-danger)' }}
                      title="Delete session"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (confirm(`Delete session for ${s.filename}?`)) {
                          try {
                            await api.deleteSession(s.id)
                            setHistorySessions((prev) => prev.filter((item) => item.id !== s.id))
                          } catch (err) {
                            alert('Failed to delete session')
                          }
                        }
                      }}
                    >
                      <Icon.Trash size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
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
          <button 
            className="pill ghost" 
            style={{ cursor: 'pointer', height: 24 }}
            onClick={async () => {
              if (window.datapilot?.file?.pickBag) {
                try {
                  const filepath = await window.datapilot.file.pickBag()
                  if (filepath) {
                    setPendingPath(filepath)
                  }
                } catch (err: any) {
                  alert(`Failed to pick file: ${err.message || err}`)
                }
              } else {
                alert('File picker is not available in this environment.')
              }
            }}
          >
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
