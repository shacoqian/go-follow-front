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


/** FomoRun 是一次 trader-scan 跑批的溯源行。字段与 go-follow 的 store.TraderScanRun 一一对应。 */
export interface FomoRun {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  error: string
  from_block: number
  to_block: number
  node: string
  git_rev: string
  edges: string
  min_txs: number
  top_cap: number
  addrs_seen: number
  addrs_delegated: number
  addrs_analyzed: number
  skipped_too_many: number
}

/**
 * FomoCandidate 是榜上一行。
 *
 * 注意两组字段的「无法计算」表示不同（go-follow spec §2 的硬约定）：
 *  - 四个份额（usdg_leg_share 等）与 hold_min_sec、hold_p50_sec、reversal_min_sec 用 **-1**（值域非负，-1 在域外）
 *  - roi_closed / roi_gross 用 **null**（ROI 值域是 [-1,+∞)，-1 是合法值＝亏光）
 * 渲染时两者都要显示成「—」，绝不能显示成 -1 或 0。
 */
export interface FomoCandidate {
  address: string
  txs: number
  signals: number
  buys: number
  sells: number
  tokens: number
  bought_usdg: string
  sold_usdg: string
  realized_usdg: string
  cost_out_usdg: string
  open_cost_usdg: string
  realized_usdg_f: number
  roi_closed: number | null
  roi_gross: number | null
  hold_min_sec: number
  hold_p50_sec: number
  reversal_min_sec: number
  usdg_leg_share: number
  skipped_leg_share: number
  orphan_share: number
  closed_share: number
}

export interface FomoBoard {
  run: FomoRun | null
  candidates: FomoCandidate[]
  limits: string[]
}

/** FomoQuery 是榜单的查询条件。刻意没有 min_realized —— 见 traderScan 的注释。 */
export interface FomoQuery {
  run?: number
  sort?: 'roi_closed' | 'realized'
  min_hold_sec?: number
  min_closed_share?: number
  max_orphan_share?: number
  min_usdg_leg_share?: number
  limit: number
  offset: number
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
  /**
   * traderScan 取候选跟单目标榜（FOMO 榜）。
   *
   * 后端该路由**无鉴权**（go-follow 侧按运维者要求去掉），但本仓库仍把页面放在
   * RequireAuth 内、并照常走 /api 反代 —— 与其它页面一致，不为它开特例。
   *
   * 刻意**不暴露 min_realized**：它会筛掉小本金高 ROI 的地址，而跟单下单用的是
   * 跟单者自己的本金（size_mode fixed/ratio，与目标仓位无关），那些人的成交规模
   * 与跟单者相当、恰恰最该跟。实测有地址赚 32.89 USDG 但 ROI 1.90、仓位平掉 94%、
   * 持仓 854 秒，比榜上「赚 7,570 而 ROI 0.98」的强一倍。
   */
  traderScan: (p: FomoQuery) =>
    request<FomoBoard>(
      'GET',
      `/admin/trader-scan${qs({
        run: p.run,
        sort: p.sort,
        min_hold_sec: p.min_hold_sec,
        min_closed_share: p.min_closed_share,
        max_orphan_share: p.max_orphan_share,
        min_usdg_leg_share: p.min_usdg_leg_share,
        limit: p.limit,
        offset: p.offset || undefined,
      })}`,
      undefined,
    ),
  operators: () => request<Operator[]>('GET', '/admin/operators', undefined),
  createOperator: () => request<{ id: number; address: string }>('POST', '/admin/operators', undefined),
  // 兜底刷新：走后端完整 Reload，重读全池的链上登记状态。日常用不到——打开本页时后端
  // 已自动重读「未登记」的那些；这个按钮管的是罕见运维，比如掌钥机撤销了某把的登记。
  refreshOperators: () => request<{ total: number; ready: number }>('POST', '/admin/operators/refresh', undefined),
  setOperatorEnabled: (id: number, on: boolean) =>
    request<{ ok: boolean; id: number; enabled: boolean }>('POST', `/admin/operators/${id}/${on ? 'enable' : 'disable'}`, undefined),
  deleteOperator: (id: number, force?: boolean) =>
    request<void>('DELETE', `/admin/operators/${id}${force ? '?force=1' : ''}`, undefined),
  // 与 walletsApi.withdraw 共用 runWithdraw：200/202（广播结果未知）都要看，故用 requestFull。
  operatorWithdraw: (id: number, amount: string): Promise<Reply<WithdrawResult>> =>
    requestFull<WithdrawResult>('POST', `/admin/operators/${id}/withdraw`, { amount }, { timeoutMs: 90_000 }),
  execStatus: () => request<ExecStatus>('GET', '/exec/status', undefined),
}
