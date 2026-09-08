import type { Position } from '@/api/positions'
import type { Decision } from '@/api/decisions'
import { fmtTime } from '@/lib/format'

// exit_fail_count>0 表示后台已尝试退出但失败，正在按退避重试；next_exit_at 为空时省略"下次尝试"。
export function exitBlockedText(p: Position): string | null {
  if (p.exit_fail_count <= 0) return null
  const base = `退出受阻：${p.last_exit_error}，连续 ${p.exit_fail_count} 次`
  if (!p.next_exit_at) return base
  return `${base}，下次尝试 ${fmtTime(p.next_exit_at).slice(11, 16)}`
}

// 决策没有 token 字段，无法精确按代币匹配，这里是近似：只要该任务最近 50 条决策里
// 有比这条仓位更新时间更新的 PENDING/SENT，就把仓位标"在途"——同一任务下并发跟卖多个
// 代币时可能会把不相关的仓位一起标上，已知的近似，见任务报告。
export function positionInFlight(
  p: Pick<Position, 'updated_at'>,
  decisions: Pick<Decision, 'outcome' | 'created_at'>[],
): boolean {
  let latest: string | null = null
  for (const dec of decisions) {
    if (dec.outcome !== 'PENDING' && dec.outcome !== 'SENT') continue
    if (!latest || dec.created_at > latest) latest = dec.created_at
  }
  return latest !== null && p.updated_at < latest
}

// dry-run 切到实盘后，虚拟仓位不再参与退出扫描/跟卖，页面标"dry-run 遗留"（只读展示）。
// liveDryRun 未知（health 还没取回来）时不标，避免刚加载时闪烁。
export function dryRunLeftover(p: Pick<Position, 'virtual'>, liveDryRun: boolean | undefined): boolean {
  return p.virtual && liveDryRun === false
}
