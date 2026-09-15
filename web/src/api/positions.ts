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
  // invested_usdg 是终身累计买入额（只加不减）。cost_usdg 会随卖出按比例扣、清仓归零，
  // 所以百分比的分母只能用它——否则已结束的仓位永远算不出赚了几成。
  invested_usdg: string
  // abandoned = 人工核销：卖不出去，已认亏并移出「进行中」；代币仍在钱包里，qty 不为 0。
  abandoned: boolean
  // symbol 读链上 symbol()，读不到是空串（退化成显示地址）。
  symbol: string
  // value_usdg 是"现在全部卖掉能拿回多少"（走真实报价路径，含滑点）。
  // null = 估不出——那本身就是这个仓位卖不掉的信号。
  value_usdg: string | null
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
  // all 是仓位总览页的数据源：跨任务列出当前用户的全部仓位，含已清仓（qty=0）的行。
  // 页面据 qty 分「进行中 / 已结束」两档，所以后端刻意不过滤已清仓的行。
  all: () => request<Position[]>('GET', '/positions', undefined),
  byTask: (taskId: number) => request<Position[]>('GET', `/tasks/${taskId}/positions`, undefined),
  // abandon 不动链上任何东西：只把仓位移出「进行中」并认亏，代币仍在钱包里。
  abandon: (id: number) => request<{ ok: boolean }>('POST', `/positions/${id}/abandon`, undefined),
  sell: (id: number, pctBps: number) =>
    request<SellResult>('POST', `/positions/${id}/sell`, { pct_bps: pctBps }, { timeoutMs: 90_000 }),
}
