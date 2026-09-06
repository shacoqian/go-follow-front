import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from '@/components/ui/toast'
import { tasksApi, type TaskInput } from '@/api/tasks'
import { StrategyForm } from './StrategyForm'
import { TaskBasicsCard } from './TaskBasicsCard'
import { defaultStrategy, toBackend, type StrategyValues } from './strategySchema'
import { useInvalidateTasks } from './useTasks'

export default function TaskFormPage() {
  const navigate = useNavigate()
  const [targetId, setTargetId] = useState<number | null>(null)
  const [walletId, setWalletId] = useState<number | null>(null)
  const invalidateTasks = useInvalidateTasks()

  // 包一层调用：react-query 会给 mutationFn 传第二个 context 参数，直接透传会污染 tasksApi.create 收到的实参。
  const create = useMutation({
    mutationFn: (body: TaskInput) => tasksApi.create(body),
    onSuccess: () => {
      toast.success('任务已创建')
      invalidateTasks()
      navigate('/tasks')
    },
  })

  function handleSubmit(values: StrategyValues) {
    if (targetId == null || walletId == null) return
    create.mutate(toBackend(values, { wallet_id: walletId, target_id: targetId }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">新建跟单</h1>
      <TaskBasicsCard
        targetId={targetId}
        walletId={walletId}
        onTargetChange={setTargetId}
        onWalletChange={setWalletId}
      />
      <StrategyForm
        defaultValues={defaultStrategy}
        submitText="创建任务"
        busy={create.isPending}
        submitDisabled={targetId == null || walletId == null}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
