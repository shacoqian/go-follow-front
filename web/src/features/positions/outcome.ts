import type { Decision } from '@/api/decisions'
import { unitsToUsdg } from '@/lib/amount'

export const OUTCOMES = ['DRY_RUN', 'SKIPPED', 'FAILED', 'EXECUTED', 'PENDING', 'SENT'] as const

export function outcomeTone(o: string): 'green' | 'gray' | 'red' | 'blue' {
  if (o === 'DRY_RUN' || o === 'EXECUTED') return 'green'
  if (o === 'SKIPPED') return 'gray'
  if (o === 'FAILED') return 'red'
  return 'blue' // PENDING / SENT
}

// filled_in/filled_out 只在成交落地后（通常是 EXECUTED）非零，其余状态两者都是 "0"。
// filled_in 恒是付出去的那一侧、filled_out 恒是收到的那一侧（与后端 executor 的口径一致）：
// 买入 = 花 USDG 得代币，卖出 = 花代币得 USDG。代币精度未知，代币一侧原样显示整数字符串。
export function fillSummary(d: Pick<Decision, 'side' | 'filled_in' | 'filled_out'>): string {
  if (d.filled_in === '0' && d.filled_out === '0') return '—'
  if (d.side === 'SELL') return `花 ${d.filled_in} 得 ${unitsToUsdg(d.filled_out)} USDG`
  return `花 ${unitsToUsdg(d.filled_in)} USDG 得 ${d.filled_out}`
}

// capped 出现在成功的买入决策上（被单笔上限截断），不是跳过：结果角标仍是 EXECUTED/SENT，
// 这里只在旁边加一个提示角标。
export function reasonBadgeLabel(reason: string): string | null {
  return reason === 'capped' ? '已截断' : null
}
