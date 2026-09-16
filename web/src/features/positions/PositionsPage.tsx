import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { unitsToUsdg } from '@/lib/amount'
import { shortAddress } from '@/lib/format'
import { Table } from '@/components/ui/table'
import { useMutation } from '@tanstack/react-query'
import { positionsApi, type Position } from '@/api/positions'
import { toast } from '@/components/ui/toast'
import { useTasks, taskKeys } from '@/features/tasks/useTasks'
import { useTargets } from '@/features/targets/useTargets'
import { useWallets } from '@/features/wallets/useWallets'
import { PositionRow } from './PositionRow'
import { SellDialog } from './SellDialog'
import { taskLabel } from './taskLabel'

function parseTaskId(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

// isOpen 区分「进行中」与「已结束」。
//
// 两个条件缺一不可：
//   - qty !== '0'：清仓后恰好是 "0"。只看数量不看 realized——加仓后又全卖光的仓位
//     realized 非零，但它确实已经结束了。
//   - !abandoned：人工核销过的仓位 qty 仍非零（代币还在钱包里，见迁移 012），
//     漏掉这一条会让核销完全失效，卖不掉的仓位照样挂在「进行中」。
export function isOpen(p: Position): boolean {
  return p.qty !== '0' && !p.abandoned
}

type StatusTab = 'open' | 'closed'

export default function PositionsPage() {
  const [params, setParams] = useSearchParams()
  const { data: tasks } = useTasks()
  const { data: targets } = useTargets()
  const { data: wallets } = useWallets()
  const qc = useQueryClient()

  // ?task=N 是任务页「查看仓位」按钮带过来的深链，保留它作为附加过滤；
  // 页面本身不再要求先选任务——没有这个参数就是全部。
  const taskFilter = parseTaskId(params.get('task'))
  const [tab, setTab] = useState<StatusTab>('open')
  const [sellPosition, setSellPosition] = useState<Position | null>(null)
  const [abandonTarget, setAbandonTarget] = useState<Position | null>(null)

  const abandon = useMutation({
    mutationFn: (id: number) => positionsApi.abandon(id),
    onSuccess: () => {
      setAbandonTarget(null)
      qc.invalidateQueries({ queryKey: ['positions'] })
      toast.success('已核销：成本计入亏损，该仓位移到「已结束」')
    },
    onError: (e: Error) => toast.error(e.message || '核销失败'),
  })

  const positionsQuery = useQuery({
    queryKey: ['positions', 'all'],
    queryFn: positionsApi.all,
    refetchInterval: 10_000,
    meta: { silent: true },
  })

  const all = positionsQuery.data ?? []
  const scoped = taskFilter != null ? all.filter((p) => p.task_id === taskFilter) : all
  const open = scoped.filter(isOpen)
  const closed = scoped.filter((p) => !isOpen(p))
  const shown = tab === 'open' ? open : closed

  function onSold() {
    qc.invalidateQueries({ queryKey: ['positions'] })
    qc.invalidateQueries({ queryKey: taskKeys.list })
  }

  function labelOf(taskId: number): string {
    const t = tasks?.find((x) => x.id === taskId)
    return t ? taskLabel(t, targets, wallets) : `#${taskId}`
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">仓位</h1>

      {taskFilter != null && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="rounded bg-slate-100 px-2 py-1">只看任务：{labelOf(taskFilter)}</span>
          <Button size="sm" variant="ghost" onClick={() => setParams({})}>
            显示全部
          </Button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button size="sm" variant={tab === 'open' ? 'default' : 'ghost'} onClick={() => setTab('open')}>
          进行中 ({open.length})
        </Button>
        <Button size="sm" variant={tab === 'closed' ? 'default' : 'ghost'} onClick={() => setTab('closed')}>
          已结束 ({closed.length})
        </Button>
      </div>

      <div className="mt-4">
        {positionsQuery.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : positionsQuery.isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">{tab === 'open' ? '没有进行中的仓位' : '没有已结束的仓位'}</p>
        ) : (
          <Table head={['任务', '代币', '数量', '投入 USDG', '已实现', '当前价值', '盈亏', '均价', '加仓', '状态', '操作']}>
            {shown.map((p) => (
              <PositionRow
                key={p.id}
                position={p}
                taskLabel={labelOf(p.task_id)}
                onSell={() => setSellPosition(p)}
                onAbandon={() => setAbandonTarget(p)}
              />
            ))}
          </Table>
        )}
      </div>
      {sellPosition && (
        <SellDialog position={sellPosition} open onOpenChange={(o) => !o && setSellPosition(null)} onSold={onSold} />
      )}
      {abandonTarget && (
        <Dialog open onOpenChange={(o) => !o && setAbandonTarget(null)} title="关闭仓位">
          <div className="space-y-3 text-sm">
            <p>
              把 <span className="font-medium">{abandonTarget.symbol || shortAddress(abandonTarget.token)}</span>{' '}
              这笔仓位移出「进行中」，并把剩余成本{' '}
              <span className="font-medium">{unitsToUsdg(abandonTarget.cost_usdg)} USDG</span> 记为亏损。
            </p>
            <p className="text-slate-500">
              这不是卖出，不会动链上任何东西——代币仍然留在跟单钱包里。将来它重新有了流动性，
              你还可以手动卖掉，所得会算作纯收益。
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAbandonTarget(null)}>
                取消
              </Button>
              <Button size="sm" disabled={abandon.isPending} onClick={() => abandon.mutate(abandonTarget.id)}>
                {abandon.isPending ? '处理中…' : '确认关闭'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
