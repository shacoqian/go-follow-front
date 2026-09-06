import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type Overview } from '@/api/admin'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { unitsToUsdg } from '@/lib/amount'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { adminKeys, useAdminUsers, useOverview } from './useAdmin'

type SwitchKey = 'kill_switch' | 'dry_run'
type PendingSwitch = { key: SwitchKey; next: boolean }

function switchDescription(key: SwitchKey, next: boolean): string {
  if (key === 'kill_switch') return next ? '确认打开全局停止？所有任务将停止跟单' : '确认关闭全局停止？'
  return '确认切换 dry-run？'
}

function MetricCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{children}</div>
    </div>
  )
}

function SwitchRow({ label, checked, onClick }: { label: string; checked: boolean; onClick(): void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onClick}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-slate-900' : 'bg-slate-200')}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

function EngineCard({ engine }: { engine: Overview['engine'] }) {
  const lag = engine.node_block - engine.engine_last_block
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-700">引擎状态</h2>
      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">引擎块 / 节点块</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span>{`${engine.engine_last_block} / ${engine.node_block}`}</span>
            {lag > 20 && <Badge tone="amber">{`落后 ${lag} 块`}</Badge>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">最近信号</dt>
          <dd className="mt-1">{fmtTime(engine.last_signal_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">退出扫描</dt>
          <dd className="mt-1">{`${fmtTime(engine.exit_scan_last_at)} · ${engine.exit_scan_errors} 次失败 · 退避 ${engine.exit_scan_backoff}`}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">受阻仓位</dt>
          <dd className="mt-1">{engine.positions_blocked}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">股票代币白名单</dt>
          <dd className="mt-1">{engine.stock_tokens}</dd>
        </div>
      </dl>
      {engine.node_error && (
        <div className="mt-3 text-sm text-red-600">
          node_error：<span>{engine.node_error}</span>
        </div>
      )}
      {engine.goswapevm_error && (
        <div className="mt-3 text-sm text-red-600">
          goswapevm_error：<span>{engine.goswapevm_error}</span>
        </div>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const { data: ov, isLoading: ovLoading, isError: ovError } = useOverview()
  const { data: users, isLoading: usersLoading, isError: usersError } = useAdminUsers()
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingSwitch | null>(null)

  const setSetting = useMutation({
    mutationFn: (p: PendingSwitch) => adminApi.setSetting(p.key, p.next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.overview })
      qc.invalidateQueries({ queryKey: ['health'] })
      setPending(null)
    },
  })

  return (
    <div>
      <h1 className="text-xl font-semibold">总览</h1>

      {ovLoading || usersLoading ? (
        <p className="mt-4 text-sm text-slate-500">加载中…</p>
      ) : ovError || usersError || !ov || !users ? (
        <p className="mt-4 text-sm text-red-600">加载失败</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="用户数">{users.length}</MetricCard>
            <MetricCard label="任务（运行中 / 总数）">{`${ov.tasks_enabled} / ${ov.tasks}`}</MetricCard>
            <MetricCard label="开仓数">{ov.positions_open}</MetricCard>
            <MetricCard label="今日决策">{ov.decisions_today}</MetricCard>
            <MetricCard label="累计花费 USDG">{unitsToUsdg(ov.spent_usdg)}</MetricCard>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <EngineCard engine={ov.engine} />
            <div className="space-y-3">
              <SwitchRow
                label="全局停止"
                checked={ov.engine.kill_switch}
                onClick={() => setPending({ key: 'kill_switch', next: !ov.engine.kill_switch })}
              />
              <SwitchRow
                label="dry-run"
                checked={ov.engine.dry_run}
                onClick={() => setPending({ key: 'dry_run', next: !ov.engine.dry_run })}
              />
            </div>
          </div>
        </>
      )}

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title="全局开关"
          description={switchDescription(pending.key, pending.next)}
          busy={setSetting.isPending}
          onConfirm={() => setSetting.mutate(pending)}
        />
      )}
    </div>
  )
}
