import { request } from './client'
import { qs } from './query'

export interface Decision {
  id: number
  signal_id: number | null
  task_id: number
  side: 'BUY' | 'SELL'
  outcome: string
  reason: string
  planned_amount_in: string
  planned_min_out: string
  quoted_out: string
  quoted_price_usdg: number
  t_seen: string | null
  t_decided: string | null
  t_quoted: string | null
  error: string
  created_at: string
  tx_id: number | null
  tx_hash: string
  filled_in: string
  filled_out: string
  gas_used: number
}

export const decisionsApi = {
  list: (p: { task?: number; outcome?: string; limit: number }) =>
    request<Decision[]>('GET', `/decisions${qs({ task: p.task, outcome: p.outcome, limit: p.limit })}`, undefined),
}
