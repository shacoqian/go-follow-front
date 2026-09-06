import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { adminApi, type AdminWithdrawal } from '@/api/admin'
import type { Task } from '@/api/tasks'
import type { Wallet } from '@/api/wallets'
import type { Position } from '@/api/positions'
import type { Decision } from '@/api/decisions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, Tr, Td } from '@/components/ui/table'
import { taskStatusBadge, taskSummaryText } from '@/features/tasks/TaskRow'
import { outcomeTone } from '@/features/positions/outcome'
import { statusText, statusTone } from '@/features/wallets/withdrawStatus'
import { fmtTime, shortAddress } from '@/lib/format'
import { unitsToUsdg, weiToEth } from '@/lib/amount'
import { adminKeys } from './useAdmin'

type OwnedWallet = Wallet & { owner: string }
type OwnedPosition = Position & { owner: string }

const TABS: { key: 'tasks' | 'positions' | 'wallets' | 'withdrawals' | 'decisions'; label: string }[] = [
  { key: 'tasks', label: '任务' },
  { key: 'positions', label: '仓位' },
  { key: 'wallets', label: '钱包' },
  { key: 'withdrawals', label: '提现' },
  { key: 'decisions', label: '决策' },
]

type Tab = (typeof TABS)[number]['key']

function isTab(v: string | null): v is Tab {
  return TABS.some((t) => t.key === v)
}

type PendingTask = { task: Task; kind: 'disable' | 'enable' }

export default function DataPage() {
  const [params, setParams] = useSearchParams()
  const ownerParam = params.get('owner') ?? ''
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'tasks'
  const [ownerInput, setOwnerInput] = useState(ownerParam)
  const [pending, setPending] = useState<PendingTask | null>(null)
  const qc = useQueryClient()

  // owner 输入框：本地回显，回车/失焦才提交到 URL——避免每敲一个字符就重新拉取列表。
  useEffect(() => setOwnerInput(ownerParam), [ownerParam])

  function commitOwner() {
    const next = ownerInput.trim()
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next) p.set('owner', next)
        else p.delete('owner')
        return p
      },
      { replace: true },
    )
  }

  function selectTab(t: Tab) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (t === 'tasks') p.delete('tab')
        else p.set('tab', t)
        return p
      },
      { replace: true },
    )
  }

  const owner = ownerParam || undefined
  type Row = Task | OwnedPosition | OwnedWallet | AdminWithdrawal | Decision
  const query = useQuery<Row[]>({
    queryKey: adminKeys.list(tab, ownerParam),
    queryFn: () => adminApi[tab](owner) as Promise<Row[]>,
    refetchInterval: 10_000,
    // 只在同一个 tab 换 owner 时保留旧行占位；切 tab 时行的形状不同（Task/Position/…），沿用会渲染出字段不匹配的行。
    placeholderData: (prevData, prevQuery) => (prevQuery?.queryKey[1] === tab ? prevData : undefined),
    meta: { silent: true },
  })

  const invalidateTasks = () => qc.invalidateQueries({ queryKey: adminKeys.list('tasks', ownerParam) })
  const disable = useMutation({
    mutationFn: (id: number) => adminApi.disableTask(id),
    onSuccess: () => {
      invalidateTasks()
      setPending(null)
    },
  })
  const enable = useMutation({
    mutationFn: (id: number) => adminApi.enableTask(id),
    onSuccess: () => {
      invalidateTasks()
      setPending(null)
    },
  })

  function onConfirm() {
    if (!pending) return
    if (pending.kind === 'disable') disable.mutate(pending.task.id)
    else enable.mutate(pending.task.id)
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">全站数据</h1>
      <div className="mt-4 max-w-xs">
        <Field label="按用户过滤" htmlFor="owner">
          <Input
            id="owner"
            value={ownerInput}
            placeholder="0x…"
            onChange={(e) => setOwnerInput(e.target.value)}
            onBlur={commitOwner}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitOwner()
            }}
          />
        </Field>
      </div>

      <div role="tablist" className="mt-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => selectTab(t.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : query.isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : tab === 'tasks' ? (
          <TasksTab
            rows={(query.data as Task[] | undefined) ?? []}
            onDisable={(t) => setPending({ task: t, kind: 'disable' })}
            onEnable={(t) => setPending({ task: t, kind: 'enable' })}
          />
        ) : tab === 'positions' ? (
          <PositionsTab rows={(query.data as OwnedPosition[] | undefined) ?? []} />
        ) : tab === 'wallets' ? (
          <WalletsTab rows={(query.data as OwnedWallet[] | undefined) ?? []} />
        ) : tab === 'withdrawals' ? (
          <WithdrawalsTab rows={(query.data as AdminWithdrawal[] | undefined) ?? []} />
        ) : (
          <DecisionsTab rows={(query.data as Decision[] | undefined) ?? []} />
        )}
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.kind === 'disable' ? '紧急禁用任务' : '恢复任务'}
          description={
            pending.kind === 'disable' ? '禁用后该任务立即停止跟单，用户无法自行恢复' : '恢复后任务将按原有配置继续运行'
          }
          confirmText={pending.kind === 'disable' ? '确认禁用' : '确认恢复'}
          destructive={pending.kind === 'disable'}
          busy={disable.isPending || enable.isPending}
          onConfirm={onConfirm}
        />
      )}
    </div>
  )
}

function TasksTab({
  rows,
  onDisable,
  onEnable,
}: {
  rows: Task[]
  onDisable(t: Task): void
  onEnable(t: Task): void
}) {
  return (
    <Table head={['用户', 'ID', '目标 ID', '钱包 ID', '状态', '摘要', '操作']}>
      {rows.map((t) => {
        const badge = taskStatusBadge(t)
        return (
          <Tr key={t.id}>
            <Td>
              <span className="font-mono text-xs">{shortAddress(t.owner)}</span>
            </Td>
            <Td>{t.id}</Td>
            <Td>{t.target_id}</Td>
            <Td>{t.wallet_id}</Td>
            <Td>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </Td>
            <Td>{taskSummaryText(t)}</Td>
            <Td>
              {t.enabled ? (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDisable(t)}>
                  紧急禁用
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onEnable(t)}>
                  恢复
                </Button>
              )}
            </Td>
          </Tr>
        )
      })}
    </Table>
  )
}

function PositionsTab({ rows }: { rows: OwnedPosition[] }) {
  return (
    <Table head={['用户', '任务 ID', '代币', '数量', '成本', '状态']}>
      {rows.map((p) => (
        <Tr key={p.id}>
          <Td>
            <span className="font-mono text-xs">{shortAddress(p.owner)}</span>
          </Td>
          <Td>{p.task_id}</Td>
          <Td>
            <span className="font-mono">{shortAddress(p.token)}</span>
          </Td>
          <Td>{p.qty}</Td>
          <Td>{unitsToUsdg(p.cost_usdg)}</Td>
          <Td>{p.virtual && <Badge tone="gray">dry-run</Badge>}</Td>
        </Tr>
      ))}
    </Table>
  )
}

function WalletsTab({ rows }: { rows: OwnedWallet[] }) {
  return (
    <Table head={['用户', '地址', '标签', '状态']}>
      {rows.map((w) => (
        <Tr key={w.id}>
          <Td>
            <span className="font-mono text-xs">{shortAddress(w.owner)}</span>
          </Td>
          <Td>
            <span className="font-mono text-xs">{shortAddress(w.address)}</span>
          </Td>
          <Td>{w.label || '（未命名）'}</Td>
          <Td>{w.status === 'disabled' ? <Badge tone="gray">已禁用</Badge> : <Badge tone="green">正常</Badge>}</Td>
        </Tr>
      ))}
    </Table>
  )
}

function WithdrawalsTab({ rows }: { rows: AdminWithdrawal[] }) {
  return (
    <Table head={['用户', '钱包 ID', '资产', '金额', '状态', '交易 ID']}>
      {rows.map((w) => (
        <Tr key={w.id}>
          <Td>
            <span className="font-mono text-xs">{shortAddress(w.owner)}</span>
          </Td>
          <Td>{w.wallet_id}</Td>
          <Td>{w.asset}</Td>
          <Td>{w.asset === 'USDG' ? unitsToUsdg(w.amount) : weiToEth(w.amount)}</Td>
          <Td>
            <Badge tone={statusTone(w.status)}>{statusText(w.status)}</Badge>
          </Td>
          <Td>{w.tx_id ?? '—'}</Td>
        </Tr>
      ))}
    </Table>
  )
}

function DecisionsTab({ rows }: { rows: Decision[] }) {
  return (
    <Table head={['时间', '任务 ID', '方向', '结果', '原因', '错误']}>
      {rows.map((d) => (
        <Tr key={d.id}>
          <Td>{fmtTime(d.created_at)}</Td>
          <Td>{d.task_id}</Td>
          <Td>{d.side}</Td>
          <Td>
            <Badge tone={outcomeTone(d.outcome)}>{d.outcome}</Badge>
          </Td>
          <Td>{d.reason}</Td>
          <Td>{d.error}</Td>
        </Tr>
      ))}
    </Table>
  )
}
