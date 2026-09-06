import { request } from './client'
import { qs } from './query'
import type { Task } from './tasks'
import type { Wallet, Withdrawal } from './wallets'
import type { Position } from './positions'
import type { Decision } from './decisions'

export interface Overview {
  targets: number
  tasks: number
  tasks_enabled: number
  positions_open: number
  decisions_today: number
  spent_usdg: string
  engine: {
    engine_last_block: number
    node_block: number
    last_signal_at: string | null
    kill_switch: boolean
    dry_run: boolean
    stock_tokens: number
    exit_scan_last_at: string | null
    exit_scan_errors: number
    exit_scan_backoff: number
    positions_blocked: number
    node_error?: string
    goswapevm_error?: string
  }
}

export interface AdminUser {
  address: string
  locked: boolean
  created_at: string
  role: 'admin' | 'user'
  wallets: number
  tasks: number
  positions_open: number
}

export interface AuditRow {
  id: number
  owner: string
  action: string
  detail: string
  ip: string
  created_at: string
}

export const adminApi = {
  overview: () => request<Overview>('GET', '/admin/overview', undefined),
  users: () => request<AdminUser[]>('GET', '/admin/users', undefined),
  lockUser: (address: string) => request<void>('POST', `/admin/users/${address.toLowerCase()}/lock`, undefined),
  unlockUser: (address: string) => request<void>('POST', `/admin/users/${address.toLowerCase()}/unlock`, undefined),
  tasks: (owner?: string) => request<Task[]>('GET', `/admin/tasks${qs({ owner })}`, undefined),
  positions: (owner?: string) =>
    request<(Position & { owner: string })[]>('GET', `/admin/positions${qs({ owner })}`, undefined),
  decisions: (owner?: string) => request<Decision[]>('GET', `/admin/decisions${qs({ owner })}`, undefined),
  wallets: (owner?: string) =>
    request<(Wallet & { owner: string })[]>('GET', `/admin/wallets${qs({ owner })}`, undefined),
  withdrawals: (owner?: string) =>
    request<(Withdrawal & { owner: string })[]>('GET', `/admin/withdrawals${qs({ owner })}`, undefined),
  enableTask: (id: number) => request<void>('POST', `/admin/tasks/${id}/enable`, undefined),
  disableTask: (id: number) => request<void>('POST', `/admin/tasks/${id}/disable`, undefined),
  audit: (p: { owner?: string; action?: string; limit: number }) =>
    request<AuditRow[]>('GET', `/admin/audit${qs({ owner: p.owner, action: p.action, limit: p.limit })}`, undefined),
  setSetting: (key: 'kill_switch' | 'dry_run', on: boolean) => request<void>('PUT', `/settings/${key}`, { on }),
}
