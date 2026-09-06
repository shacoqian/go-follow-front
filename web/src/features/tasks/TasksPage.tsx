import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { tasksApi, type Task } from '@/api/tasks'
import { buttonVariants } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Table } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { useTargets } from '@/features/targets/useTargets'
import { useWallets } from '@/features/wallets/useWallets'
import { TaskRow } from './TaskRow'
import { toast } from '@/components/ui/toast'
import { useInvalidateTasks, useTasks } from './useTasks'

export default function TasksPage() {
  const { data: tasks, isLoading, isError } = useTasks()
  const { data: targets } = useTargets()
  const { data: wallets } = useWallets()
  const invalidate = useInvalidateTasks()

  const [deleteTask, setDeleteTask] = useState<Task | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const targetById = new Map((targets ?? []).map((t) => [t.id, t]))
  const walletById = new Map((wallets ?? []).map((w) => [w.id, w]))

  const enable = useMutation({
    mutationFn: (id: number) => tasksApi.enable(id),
    onSuccess: invalidate,
  })
  const disable = useMutation({
    mutationFn: (id: number) => tasksApi.disable(id),
    onSuccess: invalidate,
  })

  // 409（仍有持仓）需要把原文精确展示并附去仓位页链接，就地展示而不走全局 toast（meta.silent）。
  // 409 时把 Radix 对话框关掉（否则它给背景打的 aria-hidden 会让下面表格的按钮查不到），
  // 错误改用页面里的常驻提示条展示；deleteTask/deleteError 都留着，再次点"删除"会重置并重新打开。
  // 成功时如带 warning（如配置重载失败）额外用 toast.info 提示，与 DeleteWalletDialog/TargetsPage 的既有约定一致。
  const remove = useMutation({
    mutationFn: (id: number) => tasksApi.remove(id),
    meta: { silent: true },
    onSuccess: (res) => {
      toast.success('任务已删除')
      if (res.warning) toast.info(res.warning)
      invalidate()
      setDialogOpen(false)
      setDeleteTask(null)
      setDeleteError(null)
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(err.message)
        setDialogOpen(false)
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  function openDelete(t: Task) {
    setDeleteTask(t)
    setDeleteError(null)
    setDialogOpen(true)
  }

  function closeDelete() {
    setDialogOpen(false)
    setDeleteTask(null)
    setDeleteError(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">跟单</h1>
        <Link to="/tasks/new" className={cn(buttonVariants({ variant: 'default' }))}>
          新建跟单
        </Link>
      </div>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['目标', '钱包', '状态', '进度', '策略', '操作']}>
            {(tasks ?? []).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                target={targetById.get(t.target_id)}
                wallet={walletById.get(t.wallet_id)}
                onEnable={() => enable.mutate(t.id)}
                onDisable={() => disable.mutate(t.id)}
                onDelete={() => openDelete(t)}
                enableBusy={enable.isPending && enable.variables === t.id}
                disableBusy={disable.isPending && disable.variables === t.id}
              />
            ))}
          </Table>
        )}
      </div>

      {deleteTask && (
        <>
          <ConfirmDialog
            open={dialogOpen}
            onOpenChange={(o) => !o && closeDelete()}
            title="删除任务"
            description="删除后该任务的历史决策仍保留，仓位必须为空。"
            confirmText="确认删除"
            destructive
            busy={remove.isPending}
            onConfirm={() => remove.mutate(deleteTask.id)}
          />
          {deleteError && (
            <div role="alert" className="fixed inset-x-0 top-4 z-50 mx-auto w-fit rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
              <p>{deleteError}</p>
              <Link to="/positions" className="underline">
                去仓位页
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
