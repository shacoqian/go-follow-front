import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { shortAddress } from '@/lib/format'
import { unitsToUsdg, weiToEth } from '@/lib/amount'
import { tasksApi, type TaskInput } from '@/api/tasks'
import { useTargets, useInvalidateTargets } from '@/features/targets/useTargets'
import { TargetDialog } from '@/features/targets/TargetDialog'
import { useWallets } from '@/features/wallets/useWallets'
import { StrategyForm } from './StrategyForm'
import { defaultStrategy, toBackend, type StrategyValues } from './strategySchema'
import { useInvalidateTasks } from './useTasks'

export default function TaskWizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [walletId, setWalletId] = useState<number | null>(null)
  const [addTargetOpen, setAddTargetOpen] = useState(false)
  const prevTargetIdsRef = useRef<Set<number> | null>(null)

  const { data: targets, isLoading: targetsLoading } = useTargets()
  const invalidateTargets = useInvalidateTargets()
  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const invalidateTasks = useInvalidateTasks()

  const activeWallets = (wallets ?? []).filter((w) => w.status === 'active')
  const selectedWallet = activeWallets.find((w) => w.id === walletId)

  // 新增目标成功后目标列表会失效重取；这里对比前后 id 集合，把新出现的那个选中。
  useEffect(() => {
    if (!prevTargetIdsRef.current || !targets) return
    const added = targets.find((t) => !prevTargetIdsRef.current!.has(t.id))
    if (added) {
      setTargetId(added.id)
      prevTargetIdsRef.current = null
    }
  }, [targets])

  function openAddTarget() {
    prevTargetIdsRef.current = new Set((targets ?? []).map((t) => t.id))
    setAddTargetOpen(true)
  }

  const create = useMutation({
    mutationFn: (body: TaskInput) => tasksApi.create(body),
    onSuccess: () => {
      toast.success('任务已创建')
      invalidateTasks()
      navigate('/tasks')
    },
  })

  function handleCreate(values: StrategyValues) {
    if (walletId == null || targetId == null) return
    create.mutate(toBackend(values, { wallet_id: walletId, target_id: targetId }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">新建跟单任务</h1>
      <p className="text-sm text-slate-500">1 选目标 → 2 选钱包 → 3 设策略</p>

      {step === 1 && targetsLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {step === 1 && !targetsLoading && (
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="目标地址" htmlFor="target">
                <Select
                  id="target"
                  value={targetId == null ? '' : String(targetId)}
                  onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: '', label: '请选择' },
                    ...(targets ?? []).map((t) => ({
                      value: String(t.id),
                      label: `${t.label || '（未命名）'} ${shortAddress(t.address)}`,
                    })),
                  ]}
                />
              </Field>
            </div>
            <Button type="button" variant="outline" onClick={openAddTarget}>
              新增目标
            </Button>
          </div>
          {(targets ?? []).length === 0 && <p className="text-sm text-slate-500">还没有目标，先新增一个。</p>}
          <div className="flex justify-end">
            <Button type="button" disabled={targetId == null} onClick={() => setStep(2)}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {step === 2 && walletsLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {step === 2 && !walletsLoading && (
        <div className="space-y-4">
          <Field label="跟单钱包" htmlFor="wallet">
            <Select
              id="wallet"
              value={walletId == null ? '' : String(walletId)}
              onChange={(e) => setWalletId(e.target.value ? Number(e.target.value) : null)}
              options={[
                { value: '', label: '请选择' },
                ...activeWallets.map((w) => ({
                  value: String(w.id),
                  label: `${w.label || '（未命名）'} ${shortAddress(w.address)}`,
                })),
              ]}
            />
          </Field>
          {selectedWallet && (
            <p className="text-sm text-slate-600">
              余额 {unitsToUsdg(selectedWallet.usdg_balance)} USDG / {weiToEth(selectedWallet.eth_balance)} ETH
            </p>
          )}
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              上一步
            </Button>
            <Button type="button" disabled={walletId == null} onClick={() => setStep(3)}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <StrategyForm
          defaultValues={defaultStrategy}
          submitText="创建任务"
          busy={create.isPending}
          onSubmit={handleCreate}
        />
      )}

      {addTargetOpen && (
        <TargetDialog
          open={addTargetOpen}
          onOpenChange={setAddTargetOpen}
          onSaved={() => {
            invalidateTargets()
          }}
        />
      )}
    </div>
  )
}
