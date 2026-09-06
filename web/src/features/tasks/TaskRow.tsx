import { Link } from 'react-router-dom'
import type { Target } from '@/api/targets'
import type { Task } from '@/api/tasks'
import type { Wallet } from '@/api/wallets'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tr, Td } from '@/components/ui/table'
import { bpsToPct, unitsToUsdg } from '@/lib/amount'
import { shortAddress } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ratioSummary, targetFilterSummary } from './strategySchema'

const SELL_MODE_TEXT: Record<Task['sell_mode'], string> = {
  manual: '手动卖',
  proportional: '按比例卖',
  all: '全部卖',
}

export function taskSummaryText(t: Task): string {
  const size =
    t.size_mode === 'fixed'
      ? `固定 ${unitsToUsdg(t.size_value)} USDG`
      : `比例 ${bpsToPct(Number(t.size_value))}%${ratioSummary(t)}`
  const tpOn = t.take_profit_bps > 0 || t.stop_loss_bps > 0 || t.max_hold_sec > 0
  return `${size}${targetFilterSummary(t)} · ${SELL_MODE_TEXT[t.sell_mode]}${tpOn ? ' · 止盈止损' : ''}`
}

// 任务状态角标：运行中 / 被管理员禁用 / 已停止。DataPage 的任务标签复用同一份逻辑，避免和这里的角标不一致。
export function taskStatusBadge(t: Task): { tone: 'green' | 'red' | 'gray'; label: string } {
  if (t.enabled) return { tone: 'green', label: '运行中' }
  if (t.paused_reason === 'admin') return { tone: 'red', label: '管理员禁用' }
  return { tone: 'gray', label: '已停止' }
}

export function TaskRow({
  task: t,
  target,
  wallet,
  onEnable,
  onDisable,
  onDelete,
  enableBusy,
  disableBusy,
}: {
  task: Task
  target: Target | undefined
  wallet: Wallet | undefined
  onEnable(): void
  onDisable(): void
  onDelete(): void
  enableBusy?: boolean
  disableBusy?: boolean
}) {
  const adminPaused = !t.enabled && t.paused_reason === 'admin'
  const limitUnlimited = t.spend_limit_usdg === '0'
  const spentPct = limitUnlimited ? 0 : Math.min(100, (Number(t.spent_usdg) / Number(t.spend_limit_usdg)) * 100)

  return (
    <Tr>
      <Td>
        <div className="font-medium">{target ? target.label || '（未命名）' : `#${t.target_id}`}</div>
        {target && <span className="font-mono text-xs text-slate-500">{shortAddress(target.address)}</span>}
      </Td>
      <Td>{wallet ? wallet.label || '（未命名）' : `#${t.wallet_id}`}</Td>
      <Td>
        <Badge tone={taskStatusBadge(t).tone}>{taskStatusBadge(t).label}</Badge>
      </Td>
      <Td>
        {limitUnlimited ? (
          '不限'
        ) : (
          <div className="min-w-[8rem]">
            <div>{`${unitsToUsdg(t.spent_usdg)} / ${unitsToUsdg(t.spend_limit_usdg)} USDG`}</div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-slate-500" style={{ width: `${spentPct}%` }} />
            </div>
          </div>
        )}
      </Td>
      <Td>{taskSummaryText(t)}</Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {t.enabled ? (
            <Button size="sm" variant="ghost" disabled={disableBusy} onClick={onDisable}>
              停止
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={adminPaused || enableBusy}
              title={adminPaused ? '任务被管理员禁用，请联系管理员恢复' : undefined}
              onClick={onEnable}
            >
              启用
            </Button>
          )}
          <Link to={`/tasks/${t.id}/edit`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            编辑
          </Link>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={onDelete}>
            删除
          </Button>
          <Link to={`/positions?task=${t.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            仓位
          </Link>
        </div>
      </Td>
    </Tr>
  )
}
