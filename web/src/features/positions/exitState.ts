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

// 仓位标"在途"：该任务下同一代币（大小写不敏感，链上地址不保证大小写一致）最近一条
// PENDING/SENT 决策，比这条仓位的 updated_at 更新——回执落地前 updated_at 不会推进，
// 落地后引擎会重新记账并推进 updated_at，标记随之消失。
export function positionInFlight(
  p: Pick<Position, 'task_id' | 'token' | 'updated_at'>,
  decisions: Pick<Decision, 'task_id' | 'token' | 'outcome' | 'created_at'>[],
): boolean {
  const token = p.token.toLowerCase()
  let latest: number | null = null
  for (const dec of decisions) {
    if (dec.outcome !== 'PENDING' && dec.outcome !== 'SENT') continue
    if (dec.task_id !== p.task_id || dec.token.toLowerCase() !== token) continue
    const t = Date.parse(dec.created_at)
    if (latest === null || t > latest) latest = t
  }
  return latest !== null && Date.parse(p.updated_at) < latest
}

// dry-run 切到实盘后，虚拟仓位不再参与退出扫描/跟卖，页面标"dry-run 遗留"（只读展示）。
// liveDryRun 未知（health 还没取回来）时不标，避免刚加载时闪烁。
export function dryRunLeftover(p: Pick<Position, 'virtual'>, liveDryRun: boolean | undefined): boolean {
  return p.virtual && liveDryRun === false
}
