import type { Position } from '@/api/positions'

// 盈亏按**终身口径**算，与后端字段一一对应：
//   盈亏 = 已实现 + (当前持仓市值 − 当前持仓剩余成本基)
//   百分比 = 盈亏 / 累计投入
//
// 为什么不是 "市值 − 成本"：卖出时成本按比例扣进 realized，只看这一刻的成本会漏掉
// 所有已经落袋的部分。已清仓的仓位成本恒为 0，那条式子会给出 0%。
//
// 为什么分母是 invested 而不是 cost：同上，cost 清仓后归零，除它等于除以零。
//
// 估不出市值（value 为 null）时返回 null——那不是"值 0"，是"不知道"，
// 两者对用户的含义完全不同，不能混成一个数字。已清仓/已核销的行没有持仓，
// 市值天然是 0，不需要报价也能算。
export interface Pnl {
  abs: number | null // USDG
  pct: number | null // 小数，0.279 = +27.9%
}

const toUsdg = (raw: string): number => Number(raw) / 1e6

export function positionPnl(p: Position): Pnl {
  const invested = toUsdg(p.invested_usdg)
  const realized = toUsdg(p.realized_usdg)
  const cost = toUsdg(p.cost_usdg)
  const holding = p.qty !== '0' && !p.abandoned
  let value = 0
  if (holding) {
    if (p.value_usdg === null) return { abs: null, pct: null }
    value = toUsdg(p.value_usdg)
  }
  const abs = realized + (value - cost)
  return { abs, pct: invested > 0 ? abs / invested : null }
}
