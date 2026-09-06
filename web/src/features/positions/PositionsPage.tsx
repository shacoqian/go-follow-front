import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Table } from '@/components/ui/table'
import { positionsApi, type Position } from '@/api/positions'
import { useTasks, taskKeys } from '@/features/tasks/useTasks'
import { useTargets } from '@/features/targets/useTargets'
import { useWallets } from '@/features/wallets/useWallets'
import { shortAddress } from '@/lib/format'
import { PositionRow } from './PositionRow'
import { SellDialog } from './SellDialog'

export default function PositionsPage() {
  const [params, setParams] = useSearchParams()
  const { data: tasks } = useTasks()
  const { data: targets } = useTargets()
  const { data: wallets } = useWallets()
  const qc = useQueryClient()

  const initialTask = params.get('task')
  const [taskId, setTaskId] = useState<number | null>(initialTask ? Number(initialTask) : null)
  const [sellPosition, setSellPosition] = useState<Position | null>(null)

  const positionsQuery = useQuery({
    queryKey: ['positions', taskId],
    queryFn: () => positionsApi.byTask(taskId!),
    enabled: taskId != null,
    refetchInterval: 10_000,
    meta: { silent: true },
  })

  const taskOptions = (tasks ?? []).map((t) => {
    const target = targets?.find((x) => x.id === t.target_id)
    const wallet = wallets?.find((x) => x.id === t.wallet_id)
    const targetLabel = target ? target.label || shortAddress(target.address) : `#${t.target_id}`
    const walletLabel = wallet ? wallet.label || shortAddress(wallet.address) : `#${t.wallet_id}`
    return { value: String(t.id), label: `${targetLabel} · ${walletLabel}` }
  })
  // 任务列表还没取回来时先补一个占位选项，避免受控 select 因为找不到匹配的 option 而把选中态回退成空。
  if (taskId != null && !taskOptions.some((o) => o.value === String(taskId))) {
    taskOptions.unshift({ value: String(taskId), label: `#${taskId}` })
  }

  function onTaskChange(value: string) {
    const id = value ? Number(value) : null
    setTaskId(id)
    setParams(id ? { task: String(id) } : {})
  }

  function onSold() {
    qc.invalidateQueries({ queryKey: ['positions', taskId] })
    qc.invalidateQueries({ queryKey: taskKeys.list })
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">仓位</h1>
      <div className="mt-4 max-w-xs">
        <Field label="任务" htmlFor="position-task">
          <Select
            id="position-task"
            options={[{ value: '', label: '请选择任务' }, ...taskOptions]}
            value={taskId != null ? String(taskId) : ''}
            onChange={(e) => onTaskChange(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4">
        {taskId == null ? (
          <p className="text-sm text-slate-500">请选择任务</p>
        ) : positionsQuery.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : positionsQuery.isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['代币', '数量', '成本 USDG', '均价', '已实现', '加仓', '状态', '操作']}>
            {(positionsQuery.data ?? []).map((p) => (
              <PositionRow key={p.id} position={p} onSell={() => setSellPosition(p)} />
            ))}
          </Table>
        )}
      </div>
      {sellPosition && (
        <SellDialog position={sellPosition} open onOpenChange={(o) => !o && setSellPosition(null)} onSold={onSold} />
      )}
    </div>
  )
}
