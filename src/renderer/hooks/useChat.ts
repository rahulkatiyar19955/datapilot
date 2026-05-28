import { useRef, useEffect } from 'react'
import { useChatStore } from '@renderer/stores/chat'
import { useSessionStore } from '@renderer/stores/session'
import { useSettingsStore } from '@renderer/stores/settings'
import * as api from '@renderer/services/api'
import type { PlanStep, Finding, CausalItem, ChatAction } from '@shared/types'

interface UseChatReturn {
  send: (message: string) => void
}

interface PlanEventData {
  plan: Array<{ specialist?: string; label?: string }>
}

interface StepEventData {
  idx: number
}

interface FinalEventData {
  response?: string
  findings?: Array<{ sev?: string; text?: string; detail?: string }>
  audit_trail?: Array<{ result_summary?: string }>
  citations?: unknown[]
}

interface ErrorEventData {
  message?: string
}

export function useChat(): UseChatReturn {
  const { addMessage, updateLastMessage, updatePlanStep, setStreaming } = useChatStore()
  const sessionId = useSessionStore((s) => s.sessionId)
  const defaultProvider = useSettingsStore((s) => s.defaultProvider)
  const defaultModel = useSettingsStore((s) => s.defaultModel)
  const abortRef = useRef<AbortController | null>(null)

  // Abort in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = (message: string) => {
    const targetSessionId = sessionId || 'general'

    // Abort any in-flight request
    abortRef.current?.abort()

    const msgId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    addMessage({ id: msgId, role: 'user', text: message })
    addMessage({ id: assistantId, role: 'assistant', time: now })
    setStreaming(true)

    abortRef.current = api.streamChat(targetSessionId, message, (event, data) => {
      if (event === 'plan') {
        const planData = data as PlanEventData
        const plan: PlanStep[] = (planData.plan ?? []).map((s) => ({
          label: s.label ?? s.specialist ?? 'step',
          done: false,
          active: false,
        }))
        updateLastMessage((m) => ({ ...m, plan }))
      } else if (event === 'step-start') {
        const { idx } = data as StepEventData
        updatePlanStep(idx, { active: true })
      } else if (event === 'step-done') {
        const { idx } = data as StepEventData
        updatePlanStep(idx, { done: true, active: false })
      } else if (event === 'final') {
        const final = data as FinalEventData

        const findings: Finding[] | undefined = final.findings?.map((f) => ({
          sev: (f.sev ?? 'info') as Finding['sev'],
          text: f.text ?? '',
          detail: f.detail,
        }))

        // Extract causal chain from audit_trail if present
        const trail = final.audit_trail ?? []
        const causal: CausalItem[] | undefined =
          trail.length > 0
            ? trail.map((step) => ({ text: step.result_summary ?? '' })).filter((c) => c.text)
            : undefined

        const actions: ChatAction[] = sessionId
          ? [
              { iconName: 'Clock', label: 'Jump to timeline', target: 'timeline' },
              { iconName: 'Graph', label: 'See causal graph', target: 'kgraph' },
              { iconName: 'Activity', label: 'Metric: lidar latency', target: 'metrics' },
            ]
          : []

        updateLastMessage((m) => ({
          ...m,
          summary: final.response,
          findings: findings?.length ? findings : undefined,
          causal: causal?.length ? causal : undefined,
          actions,
        }))

        setStreaming(false)
      } else if (event === 'error') {
        const errData = data as ErrorEventData
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: errData.message ?? 'An error occurred.',
        })
        setStreaming(false)
      }
    }, defaultProvider, defaultModel)
  }

  return { send }
}
