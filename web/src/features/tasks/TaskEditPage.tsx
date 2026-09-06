import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from '@/components/ui/toast'
import { shortAddress } from '@/lib/format'
import { tasksApi, type TaskInput } from '@/api/tasks'
import { useTargets } from '@/features/targets/useTargets'
import { useWallets } from '@/features/wallets/useWallets'
import { StrategyForm } from './StrategyForm'
import { fromBackend, toBackend, type StrategyValues } from './strategySchema'
import { useInvalidateTasks, useTasks } from './useTasks'

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: tasks, isLoading: tasksLoading } = useTasks()
  const { data: targets } = useTargets()
  const { data: wallets } = useWallets()
  const invalidateTasks = useInvalidateTasks()

  const task = tasks?.find((t) => t.id === Number(id))
  const target = targets?.find((t) => t.id === task?.target_id)
  const wallet = wallets?.find((w) => w.id === task?.wallet_id)

  const update = useMutation({
    mutationFn: (body: TaskInput) => tasksApi.update(task!.id, body),
    onSuccess: () => {
      toast.success('已保存')
      invalidateTasks()
      navigate('/tasks')
    },
  })

  if (tasksLoading) {
    return <p className="text-sm text-slate-500">加载中…</p>
  }

  if (!task) {
    return <p className="text-sm text-slate-500">任务不存在</p>
  }

  function handleSubmit(values: StrategyValues) {
    update.mutate(toBackend(values, { wallet_id: task!.wallet_id, target_id: task!.target_id }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">编辑跟单任务</h1>
      <p className="text-sm text-slate-600">
        目标 {target ? `${target.label || '（未命名）'} ${shortAddress(target.address)}` : `#${task.target_id}`} · 钱包{' '}
        {wallet ? `${wallet.label || '（未命名）'} ${shortAddress(wallet.address)}` : `#${task.wallet_id}`}
      </p>
      <StrategyForm defaultValues={fromBackend(task)} submitText="保存" busy={update.isPending} onSubmit={handleSubmit} />
    </div>
  )
}
