import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { walletsApi, withdrawalsApi, type Wallet, type WithdrawResult } from '@/api/wallets'
import { useSession } from '@/features/auth/session'
import { usdgToUnits, ethToWei, unitsToUsdg, weiToEth } from '@/lib/amount'
import { txUrl } from '@/lib/explorer'
import { isTerminal, statusText, statusTone, withdrawErrorText } from './withdrawStatus'

const ASSET_OPTIONS = [
  { value: 'USDG', label: 'USDG' },
  { value: 'ETH', label: 'ETH' },
]

export function WithdrawDialog({
  wallet,
  open,
  onOpenChange,
  onSubmitted,
  pollMs = 3000,
}: {
  wallet: Wallet
  open: boolean
  onOpenChange(o: boolean): void
  onSubmitted(): void
  pollMs?: number
}) {
  const session = useSession((s) => s.session)
  const [asset, setAsset] = useState<'USDG' | 'ETH'>('USDG')
  const [amount, setAmount] = useState('')
  const [all, setAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WithdrawResult | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // 走全局 mutationCache 会重复弹一次，这里内联展示错误，故 meta.silent。
  const m = useMutation({
    mutationFn: (vars: { asset: 'USDG' | 'ETH'; amount: string }) => walletsApi.withdraw(wallet.id, vars),
    meta: { silent: true },
    onSuccess: (reply) => {
      setResult(reply.data)
      setNote(reply.status === 202 ? (reply.data.note ?? null) : null)
      onSubmitted()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(withdrawErrorText(err))
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  // 提现结果确认状态：状态终态（CONFIRMED/FAILED）前持续轮询，之后停止。
  const poll = useQuery({
    queryKey: ['withdrawal', result?.id ?? 0],
    queryFn: () => withdrawalsApi.get(result!.id),
    enabled: !!result,
    refetchInterval: (q) => (q.state.data && isTerminal(q.state.data.status) ? false : pollMs),
  })

  const balance = wallet.balance_error
    ? '余额读取失败'
    : `可用 ${asset === 'USDG' ? unitsToUsdg(wallet.usdg_balance) : weiToEth(wallet.eth_balance)} ${asset}`

  function handleOpenChange(o: boolean) {
    if (!o) {
      setAsset('USDG')
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
    let amountUnits: string
    try {
      amountUnits = all ? 'all' : asset === 'USDG' ? usdgToUnits(amount) : ethToWei(amount)
    } catch (e) {
      setError(e instanceof Error ? e.message : '金额格式不正确')
      return
    }
    if (!all && amountUnits === '0') {
      setError('金额必须大于 0')
      return
    }
    m.mutate({ asset, amount: amountUnits })
  }

  const hash = poll.data?.tx_hash ?? result?.tx_hash
  const hashUrl = hash ? txUrl(hash) : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="提现">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{balance}</p>
        <Field label="资产" htmlFor="withdraw-asset">
          <Select
            id="withdraw-asset"
            options={ASSET_OPTIONS}
            value={asset}
            onChange={(e) => setAsset(e.target.value as 'USDG' | 'ETH')}
          />
        </Field>
        <Field label="金额" htmlFor="withdraw-amount">
          <Input
            id="withdraw-amount"
            value={amount}
            disabled={all}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Checkbox label="全部" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <div className="space-y-1">
          <Label htmlFor="withdraw-to">收款地址</Label>
          <Input id="withdraw-to" readOnly value={session?.address ?? ''} />
          <p className="text-xs text-slate-500">只能提到登录地址</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={m.isPending}>
            提现
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
              {poll.data && <Badge tone={statusTone(poll.data.status)}>{statusText(poll.data.status)}</Badge>}
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
            {poll.data?.status === 'FAILED' && (
              <div role="alert" className="space-y-1 text-red-600">
                <p>{poll.data.error}</p>
                <p>请按哈希核对链上实际状态</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
