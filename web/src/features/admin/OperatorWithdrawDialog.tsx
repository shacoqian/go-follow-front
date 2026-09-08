import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { adminApi, type Operator } from '@/api/admin'
import type { Withdrawal, WithdrawResult } from '@/api/wallets'
import { ethToWei } from '@/lib/amount'
import { txUrl } from '@/lib/explorer'
import { statusText, statusTone } from '@/features/wallets/withdrawStatus'

// operator 只持 ETH（不持本金），提回只有金额/全部两个输入，收款地址恒为管理员登录地址
// （后端决定，不接受参数），这里不用像 WithdrawDialog 那样选资产/展示收款地址。
export function OperatorWithdrawDialog({
  operator,
  open,
  onOpenChange,
  onSubmitted,
}: {
  operator: Operator
  open: boolean
  onOpenChange(o: boolean): void
  onSubmitted(): void
}) {
  const [amount, setAmount] = useState('')
  const [all, setAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WithdrawResult | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // 走全局 mutationCache 会重复弹一次，这里内联展示错误，故 meta.silent。
  const m = useMutation({
    mutationFn: (amountWei: string) => adminApi.operatorWithdraw(operator.id, amountWei),
    meta: { silent: true },
    onSuccess: (reply) => {
      setResult(reply.data)
      setNote(reply.status === 202 ? (reply.data.note ?? null) : null)
      toast.success('已提交提回')
      onSubmitted()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  function handleOpenChange(o: boolean) {
    // 提回请求在途时不让关：关掉就看不到广播结果和哈希了。
    if (!o && m.isPending) return
    if (!o) {
      setAmount('')
      setAll(false)
      setError(null)
      setResult(null)
      setNote(null)
      m.reset()
    }
    onOpenChange(o)
  }

  function onSubmit() {
    setError(null)
    setResult(null)
    setNote(null)
    let amountWei: string
    try {
      amountWei = all ? 'all' : ethToWei(amount)
    } catch (e) {
      setError(e instanceof Error ? e.message : '金额格式不正确')
      return
    }
    if (!all && amountWei === '0') {
      setError('金额必须大于 0')
      return
    }
    m.mutate(amountWei)
  }

  const hash = result?.tx_hash
  const hashUrl = hash ? txUrl(hash) : null
  const status = result?.status as Withdrawal['status'] | undefined

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="提回 ETH" hideClose={m.isPending}>
      <div className="space-y-3">
        <Field label="金额（ETH）" htmlFor="operator-withdraw-amount">
          <Input
            id="operator-withdraw-amount"
            value={amount}
            disabled={all}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Checkbox label="全部" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={m.isPending}>
            提回
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {result && (
          <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex items-center gap-2">
              {status && <Badge tone={statusTone(status)}>{statusText(status)}</Badge>}
              {hash &&
                (hashUrl ? (
                  <a className="font-mono underline" href={hashUrl} target="_blank" rel="noreferrer">
                    {hash}
                  </a>
                ) : (
                  <>
                    <span className="font-mono">{hash}</span>
                    <CopyButton text={hash} />
                  </>
                ))}
            </div>
            {note && <p className="text-slate-600">{note}</p>}
          </div>
        )}
      </div>
    </Dialog>
  )
}
