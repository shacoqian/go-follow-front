import { request } from './client'

export interface Position {
  id: number
  task_id: number
  token: string
  qty: string
  cost_usdg: string
  avg_price_usdg: number
  addon_count: number
  tp_done: boolean
  realized_usdg: string
  virtual: boolean
  updated_at: string
  exit_fail_count: number
  last_exit_error: string
  next_exit_at: string | null
}

export interface SellResult {
  outcome: string
  reason: string
  sell_qty: string
  quoted_out: string
  // 实盘（outcome=SENT）时才有：交易已广播，前端按它/决策状态轮询成交结果。
  tx_id?: number
}

export const positionsApi = {
  byTask: (taskId: number) => request<Position[]>('GET', `/tasks/${taskId}/positions`, undefined),
  sell: (id: number, pctBps: number) =>
    request<SellResult>('POST', `/positions/${id}/sell`, { pct_bps: pctBps }, { timeoutMs: 90_000 }),
}
