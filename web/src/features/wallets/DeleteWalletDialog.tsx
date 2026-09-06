import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { walletsApi, type Wallet } from '@/api/wallets'
import { signAction } from '@/features/auth/auth'
import { unitsToUsdg, weiToEth } from '@/lib/amount'

// 409 分支的展示状态：任务引用（附任务列表）、余额未清（提供强制删除）、其他等待类原因（提现中/余额未知/忙）。
type Branch =
  | { kind: 'tasks'; message: string; taskIds: number[] }
  | { kind: 'balance'; message: string; usdg: string; eth: string }
  | { kind: 'wait'; message: string }
  | null

export function DeleteWalletDialog({
  wallet,
  open,
  onOpenChange,
  onDeleted,
}: {
  wallet: Wallet
  open: boolean
  onOpenChange(o: boolean): void
  onDeleted(): void
}) {
  const [ack, setAck] = useState(false)
  const [branch, setBranch] = useState<Branch>(null)

  // 内联展示 409 分支，不走全局 toast；非 409 的 ApiError 和 signAction 的非 ApiError 失败都手动 toast。
  const m = useMutation({
    mutationFn: (force: boolean) => signAction('delete_wallet', { wallet_id: String(wallet.id), force: force ? '1' : '0' }).then(
      (sig) => walletsApi.remove(wallet.id, sig, force),
    ),
    meta: { silent: true },
    onSuccess: () => {
      toast.success('钱包已删除')
      onDeleted()
      onOpenChange(false)
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const data = (err.data ?? {}) as { task_ids?: number[]; usdg?: string; eth?: string }
        if (err.message === '钱包仍被任务引用') {
          setBranch({ kind: 'tasks', message: err.message, taskIds: data.task_ids ?? [] })
        } else if (err.message === '钱包仍有余额') {
          setBranch({ kind: 'balance', message: err.message, usdg: data.usdg ?? '0', eth: data.eth ?? '0' })
        } else {
          setBranch({ kind: 'wait', message: err.message })
        }
      } else if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  function run(force: boolean) {
    setBranch(null)
    m.mutate(force)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="删除钱包">
      <div className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>钱包未被任何跟单任务引用</li>
          <li>钱包没有正在进行的提现</li>
          <li>钱包余额不超过 0.01 USDG 且不超过 0.0001 ETH</li>
        </ul>
        <Checkbox
          label="我知道删除不可恢复"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        <div className="space-y-2">
          <Button variant="destructive" disabled={!ack || m.isPending} onClick={() => run(false)}>
            签名并删除
          </Button>
          {branch?.kind === 'tasks' && (
            <div role="alert" className="text-sm text-red-600">
              <p>{branch.message}</p>
              <ul className="list-disc pl-5">
                {branch.taskIds.map((id) => (
                  <li key={id}>
                    <Link to="/tasks" className="underline">
                      任务 #{id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {branch?.kind === 'balance' && (
            <div role="alert" className="space-y-2 text-sm text-red-600">
              <p>
                钱包仍有余额：USDG {unitsToUsdg(branch.usdg)}，ETH {weiToEth(branch.eth)}
              </p>
              <Button variant="destructive" disabled={m.isPending} onClick={() => run(true)}>
                仍然删除
              </Button>
            </div>
          )}
          {branch?.kind === 'wait' && (
            <div role="alert" className="text-sm text-red-600">
              <p>{branch.message}</p>
              <p>请稍后重试</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
