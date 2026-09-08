import { request, requestFull, type Reply } from './client'
import { qs } from './query'
import type { Task } from './tasks'
import type { Wallet, Withdrawal, WithdrawResult } from './wallets'
import type { Position } from './positions'
import type { Decision } from './decisions'

export interface Overview {
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
    targets: number
    exit_scan_last_at: string | null
    exit_scan_errors: number
    exit_scan_backoff: number
    positions_blocked: number
    node_error?: string
    goswapevm_error?: string
    operators_ready: number
  }
}

// operator 系统钱包（签 SWAP 的 gas 钱包）。owner 恒为空串，不属于任何用户。
export interface Operator {
  id: number
  address: string
  label: string
  enabled: boolean
  registered: boolean
  in_flight: number
  removed: boolean
  removed_reason: string
  created_at: string
  eth_balance: string
  eth_error?: string
}

export interface ExecStatus {
  operators_ready: number
  allowance_cache_entries: number
  daily_spent: { wallet_id: number; spent_usdg: string }[]
  since?: string
}

export interface AdminUser {
  address: string
  locked: boolean
  created_at: string
  last_login_at: string | null
  role: 'admin' | 'user'
  wallets: number
  tasks: number
  positions_open: number
}

export type AdminWithdrawal = Omit<Withdrawal, 'tx_hash'> & { owner: string; tx_id: number | null }

export interface AuditRow {
  id: number
  owner: string
  action: string
  detail: string
  ip: string
  created_at: string
}

// entries 至少有 ts/level/module/msg/caller，其余字段任意（见 logsearch.Result）。
export type LogEntry = Record<string, unknown>

export interface LogSearchResult {
  total: number
  files: string[]
  entries: LogEntry[]
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
    request<AdminWithdrawal[]>('GET', `/admin/withdrawals${qs({ owner })}`, undefined),
  enableTask: (id: number) => request<void>('POST', `/admin/tasks/${id}/enable`, undefined),
  disableTask: (id: number) => request<void>('POST', `/admin/tasks/${id}/disable`, undefined),
  audit: (p: { owner?: string; action?: string; limit: number }) =>
    request<AuditRow[]>('GET', `/admin/audit${qs({ owner: p.owner, action: p.action, limit: p.limit })}`, undefined),
  logs: (p: { q?: string; level?: string; from?: string; to?: string; limit: number; dedup?: string }) =>
    request<LogSearchResult>(
      'GET',
      `/admin/logs${qs({ q: p.q, level: p.level, from: p.from, to: p.to, limit: p.limit, dedup: p.dedup })}`,
      undefined,
    ),
  setSetting: (key: 'kill_switch' | 'dry_run', on: boolean) => request<void>('PUT', `/settings/${key}`, { on }),
  operators: () => request<Operator[]>('GET', '/admin/operators', undefined),
  createOperator: () => request<{ id: number; address: string }>('POST', '/admin/operators', undefined),
  setOperatorEnabled: (id: number, on: boolean) =>
    request<{ ok: boolean; id: number; enabled: boolean }>('POST', `/admin/operators/${id}/${on ? 'enable' : 'disable'}`, undefined),
  deleteOperator: (id: number, force?: boolean) =>
    request<void>('DELETE', `/admin/operators/${id}${force ? '?force=1' : ''}`, undefined),
  // 与 walletsApi.withdraw 共用 runWithdraw：200/202（广播结果未知）都要看，故用 requestFull。
  operatorWithdraw: (id: number, amount: string): Promise<Reply<WithdrawResult>> =>
    requestFull<WithdrawResult>('POST', `/admin/operators/${id}/withdraw`, { amount }, { timeoutMs: 90_000 }),
  execStatus: () => request<ExecStatus>('GET', '/exec/status', undefined),
}
