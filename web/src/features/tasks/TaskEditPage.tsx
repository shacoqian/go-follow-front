import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from '@/components/ui/toast'
import { tasksApi, type TaskInput } from '@/api/tasks'
import { StrategyForm } from './StrategyForm'
import { TaskBasicsCard } from './TaskBasicsCard'
import { fromBackend, toBackend, type StrategyValues } from './strategySchema'
import { useInvalidateTasks, useTasks } from './useTasks'

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: tasks, isLoading: tasksLoading } = useTasks()
  const invalidateTasks = useInvalidateTasks()

  const task = tasks?.find((t) => t.id === Number(id))

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
      <TaskBasicsCard targetId={task.target_id} walletId={task.wallet_id} readOnly />
      <StrategyForm defaultValues={fromBackend(task)} submitText="保存" busy={update.isPending} onSubmit={handleSubmit} />
    </div>
  )
}
