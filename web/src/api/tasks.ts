import { request } from './client'

export interface TaskInput {
  wallet_id: number
  target_id: number
  size_mode: 'fixed' | 'ratio'
  size_value: string
  max_per_trade_usdg: string
  min_target_trade_usdg: string
  spend_limit_usdg: string
  max_addon_per_token: number
  sell_mode: 'manual' | 'proportional' | 'all'
  take_profit_bps: number
  take_profit_sell_bps: number
  stop_loss_bps: number
  max_hold_sec: number
  follow_curve: boolean
  platforms: string[]
  quote_assets: string[]
  max_creator_tax_bps: number
  skip_launch_window_sec: number
  max_chase_bps: number
  token_blacklist: string[]
  slippage_bps: number
  retry_max: number
}

export interface Task extends TaskInput {
  id: number
  owner: string
  enabled: boolean
  spent_usdg: string
  consecutive_failures: number
  paused_reason: string
  paused_at: string | null
}

export const tasksApi = {
  list: () => request<Task[]>('GET', '/tasks'),
  create: (body: TaskInput) => request<{ id: number }>('POST', '/tasks', body),
  update: (id: number, body: TaskInput) => request<void>('PUT', `/tasks/${id}`, body),
  enable: (id: number) => request<void>('POST', `/tasks/${id}/enable`),
  disable: (id: number) => request<void>('POST', `/tasks/${id}/disable`),
  remove: (id: number) => request<{ ok: boolean; warning?: string }>('DELETE', `/tasks/${id}`),
}
