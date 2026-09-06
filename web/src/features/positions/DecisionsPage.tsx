import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Table, Tr, Td } from '@/components/ui/table'
import { decisionsApi } from '@/api/decisions'
import { useTasks } from '@/features/tasks/useTasks'
import { useTargets } from '@/features/targets/useTargets'
import { useWallets } from '@/features/wallets/useWallets'
import { unitsToUsdg } from '@/lib/amount'
import { fmtTime } from '@/lib/format'
import { outcomeTone, OUTCOMES } from './outcome'
import { taskOptions as buildTaskOptions } from './taskLabel'

const LIMIT_START = 50
const LIMIT_STEP = 50
const LIMIT_MAX = 1000

export default function DecisionsPage() {
  const { data: tasks } = useTasks()
  const { data: targets } = useTargets()
  const { data: wallets } = useWallets()

  const [task, setTask] = useState<number | null>(null)
  const [outcome, setOutcome] = useState('')
  const [limit, setLimit] = useState(LIMIT_START)

  const params = { ...(task ? { task } : {}), ...(outcome ? { outcome } : {}), limit }
  const query = useQuery({
    queryKey: ['decisions', task, outcome, limit],
    queryFn: () => decisionsApi.list(params),
    refetchInterval: 10_000,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })

  const taskOptions = buildTaskOptions(tasks, targets, wallets)
  const rows = query.data ?? []
  const canLoadMore = limit < LIMIT_MAX && rows.length >= limit

  return (
    <div>
      <h1 className="text-xl font-semibold">决策</h1>
      <div className="mt-4 flex max-w-lg gap-4">
        <Field label="任务" htmlFor="decision-task">
          <Select
            id="decision-task"
            options={[{ value: '', label: '全部' }, ...taskOptions]}
            value={task != null ? String(task) : ''}
            onChange={(e) => setTask(e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="结果" htmlFor="decision-outcome">
          <Select
            id="decision-outcome"
            options={[{ value: '', label: '全部' }, ...OUTCOMES.map((o) => ({ value: o, label: o }))]}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : query.isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['时间', '方向', '结果', '原因', '计划买入', '报价得到', '报价均价', '错误']}>
            {rows.map((d) => (
              <Tr key={d.id}>
                <Td>{fmtTime(d.created_at)}</Td>
                <Td>{d.side}</Td>
                <Td>
                  <Badge tone={outcomeTone(d.outcome)}>{d.outcome}</Badge>
                </Td>
                <Td>{d.reason}</Td>
                <Td>{d.side === 'SELL' ? '—' : unitsToUsdg(d.planned_amount_in)}</Td>
                <Td>{d.quoted_out}</Td>
                <Td>{d.quoted_price_usdg}</Td>
                <Td>{d.error}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
      {canLoadMore && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => Math.min(l + LIMIT_STEP, LIMIT_MAX))}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  )
}
