import type { Position } from '@/api/positions'
import { fmtTime } from '@/lib/format'

// exit_fail_count>0 表示后台已尝试退出但失败，正在按退避重试；next_exit_at 为空时省略"下次尝试"。
export function exitBlockedText(p: Position): string | null {
  if (p.exit_fail_count <= 0) return null
  const base = `退出受阻：${p.last_exit_error}，连续 ${p.exit_fail_count} 次`
  if (!p.next_exit_at) return base
  return `${base}，下次尝试 ${fmtTime(p.next_exit_at).slice(11, 16)}`
}
