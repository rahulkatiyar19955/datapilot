import type { JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { PlanCard } from './PlanCard'
import { FindingsCard } from './FindingsCard'
import { CausalChain } from './CausalChain'
import { useUIStore } from '@renderer/stores/ui'
import type { ChatMessage as ChatMessageType } from '@shared/types'
import type { WorkspaceTab } from '@shared/types'

interface ChatMessageProps {
  msg: ChatMessageType
}

function ActionIcon({ name }: { name: string }): JSX.Element | null {
  const Comp = Icon[name as keyof typeof Icon] as
    | React.ComponentType<{ size?: number }>
    | undefined
  if (!Comp) return null
  return <Comp size={12} />
}

export function ChatMessage({ msg }: ChatMessageProps): JSX.Element {
  const setTab = useUIStore((s) => s.setTab)

  if (msg.role === 'user') {
    return (
      <div className="row" style={{ justifyContent: 'flex-end', padding: '6px 14px' }}>
        <div style={{
          maxWidth: '85%',
          background: 'var(--color-chat-user-bg)',
          border: '1px solid var(--color-chat-user-border)',
          color: 'var(--color-chat-user-text)',
          borderRadius: '12px 12px 2px 12px',
          padding: '8px 12px',
          fontSize: 12.5,
          lineHeight: 1.45,
        }}>
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'system') {
    return (
      <div style={{ padding: '4px 14px' }}>
        <div className="row gap-2 dim" style={{ fontSize: 11.5, padding: '4px 0' }}>
          <Icon.Sparkles size={12} />
          <span>{msg.text}</span>
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div style={{ padding: '6px 14px' }}>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'linear-gradient(135deg, var(--color-accent), oklch(0.55 0.18 280))',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-bg-0)',
          flexShrink: 0,
        }}>
          <Icon.Sparkles size={12} strokeWidth={2} />
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-1)' }}>
          DataPilot
        </span>
        {msg.time && (
          <span className="dim" style={{ fontSize: 11 }}>· {msg.time}</span>
        )}
      </div>

      {msg.summary && (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-1)', lineHeight: 1.5, marginBottom: 8 }}>
          {msg.summary}
        </div>
      )}

      {msg.plan && <PlanCard steps={msg.plan} />}
      {msg.findings && <FindingsCard findings={msg.findings} />}
      {msg.causal && <CausalChain items={msg.causal} />}

      {msg.actions && msg.actions.length > 0 && (
        <div className="row gap-2" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {msg.actions.map((a, i) => (
            <button
              key={i}
              className="btn sm"
              onClick={() => setTab(a.target as WorkspaceTab)}
            >
              <ActionIcon name={a.iconName} />
              {a.label}
              <Icon.ArrowRight size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
