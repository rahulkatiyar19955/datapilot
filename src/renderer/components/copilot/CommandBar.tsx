import { useState, type JSX, type KeyboardEvent } from 'react'
import { Icon } from '@renderer/components/Icon'
import { useChatStore } from '@renderer/stores/chat'
import { useChat } from '@renderer/hooks/useChat'

export function CommandBar(): JSX.Element {
  const [input, setInput] = useState('')
  const streaming = useChatStore((s) => s.streaming)
  const { send } = useChat()

  const handleSend = () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    send(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ padding: '8px 14px 14px', flexShrink: 0 }}>
      <div className="col" style={{
        background: 'var(--color-bg-3)',
        border: '1px solid var(--color-border-2)',
        borderRadius: 10,
        padding: '10px 12px',
        gap: 8,
      }}>
        <textarea
          placeholder="Ask anything about this run, or paste a topic name…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          rows={2}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-0)',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            resize: 'none',
            lineHeight: 1.45,
            opacity: streaming ? 0.6 : 1,
          }}
        />
        <div className="row gap-2">
          <button className="btn ghost icon sm" title="Mic (not available)" disabled>
            <Icon.Mic size={13} />
          </button>
          <button className="btn ghost icon sm" title="Attach (not available)" disabled>
            <Icon.Upload size={13} />
          </button>
          <span className="dim mono" style={{ fontSize: 10.5 }}>⌘↵ to send</span>
          <div className="flex1" />
          <button
            className="btn primary sm"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
          >
            {streaming ? (
              <>
                <span className="pulse" style={{ width: 12, height: 12, display: 'flex', alignItems: 'center' }}>
                  <Icon.Activity size={12} />
                </span>
                Thinking…
              </>
            ) : (
              <>
                <Icon.Send size={12} />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
