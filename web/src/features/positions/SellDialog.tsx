import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { positionsApi, type Position, type SellResult } from '@/api/positions'
import { unitsToUsdg } from '@/lib/amount'

export function SellDialog({
  position,
  open,
  onOpenChange,
  onSold,
}: {
  position: Position
  open: boolean
  onOpenChange(open: boolean): void
  onSold(): void
}) {
  const [pct, setPct] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SellResult | null>(null)

  // 走全局 mutationCache 会重复弹一次，这里内联展示错误和结果，故 meta.silent。
  const m = useMutation({
    mutationFn: (p: number) => positionsApi.sell(position.id, p * 100),
    meta: { silent: true },
    onSuccess: (res) => {
      setResult(res)
      toast.success('已提交卖出')
      onSold()
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
    // 卖出请求在途时不让关：关掉就看不到提交结果了。
    if (!o && m.isPending) return
    if (!o) {
      setPct(100)
      setError(null)
      setResult(null)
      m.reset()
    }
    onOpenChange(o)
  }

  function onConfirm() {
    setError(null)
    m.mutate(pct)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="手动卖出" hideClose={m.isPending}>
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="text-sm text-slate-600">卖出比例</span>
          <input
            aria-label="卖出比例"
            type="range"
            min={1}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-sm text-slate-600">{pct}%</div>
        </div>
        <p className="text-xs text-slate-500">dry-run 下作用于虚拟仓位</p>
        <div className="flex justify-end">
          <Button onClick={onConfirm} disabled={m.isPending}>
            确认卖出
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {result && (
          <p className="text-sm">
            结果 {result.outcome}（{result.reason}）· 卖出 {result.sell_qty} · 预计得到 {unitsToUsdg(result.quoted_out)} USDG
            {result.outcome === 'SENT' && result.tx_id !== undefined && <> · 已广播，等待回执（tx_id {result.tx_id}）</>}
          </p>
        )}
      </div>
    </Dialog>
  )
}
