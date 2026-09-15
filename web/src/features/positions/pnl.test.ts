import { describe, it, expect } from 'vitest'
import type { Position } from '@/api/positions'
import { positionPnl } from './pnl'

const base: Position = {
  id: 1, task_id: 1, token: '0xaa', qty: '0', cost_usdg: '0', avg_price_usdg: 0,
  addon_count: 1, tp_done: false, realized_usdg: '0', invested_usdg: '5000000',
  abandoned: false, symbol: 'X', value_usdg: null, virtual: false,
  updated_at: '', exit_fail_count: 0, last_exit_error: '', next_exit_at: null,
}

describe('positionPnl', () => {
  it('已清仓：成本已归零，靠 invested 才算得出百分比', () => {
    // FYBER 真实数据：投入 5.00，卖回 6.3961，已实现 +1.3961
    const p = { ...base, qty: '0', cost_usdg: '0', realized_usdg: '1396100' }
    const r = positionPnl(p)
    expect(r.abs).toBeCloseTo(1.3961, 4)
    expect(r.pct).toBeCloseTo(0.279, 3) // +27.9%
  })

  it('持仓中：盈亏 = 已实现 + (市值 − 剩余成本)', () => {
    // GSHI 真实数据：投入 5.00、成本仍挂 5.00、现值 3.4951
    const p = { ...base, qty: '828856', cost_usdg: '5000000', value_usdg: '3495100' }
    const r = positionPnl(p)
    expect(r.abs).toBeCloseTo(-1.5049, 4)
    expect(r.pct).toBeCloseTo(-0.301, 3) // −30.1%
  })

  it('估不出市值时返回 null，不能当成 0', () => {
    // 假 NVDA：持仓中但报不出价。当成 0 会显示 −100%，那是个没有依据的断言。
    const p = { ...base, qty: '23951', cost_usdg: '5000000', value_usdg: null }
    expect(positionPnl(p)).toEqual({ abs: null, pct: null })
  })

  it('已核销：认亏已经进了 realized，市值不再参与，估不出也照样出数', () => {
    // 核销把 cost 转进 realized：realized=-5、cost=0、qty 仍非零、报不出价
    const p = { ...base, qty: '23951', cost_usdg: '0', realized_usdg: '-5000000', abandoned: true, value_usdg: null }
    const r = positionPnl(p)
    expect(r.abs).toBeCloseTo(-5, 6)
    expect(r.pct).toBeCloseTo(-1, 6) // −100%
  })

  it('累计投入为 0 时不给百分比（不除以零）', () => {
    const p = { ...base, invested_usdg: '0', realized_usdg: '100' }
    expect(positionPnl(p).pct).toBeNull()
  })
})
