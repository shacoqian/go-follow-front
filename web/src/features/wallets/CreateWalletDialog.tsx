import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { walletsApi } from '@/api/wallets'

export function CreateWalletDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange(o: boolean): void
  onCreated(): void
}) {
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  // 走全局 mutationCache：失败自动 toast（401 除外），这里不重复弹。
  const m = useMutation({
    // 包一层调用：react-query 会给 mutationFn 传第二个 context 参数，直接透传会污染 walletsApi.create 收到的实参。
    mutationFn: (body: { label: string; note: string }) => walletsApi.create(body),
    onSuccess: () => {
      // 先失效列表，再切到结果视图——保证列表数据和用户看到的地址一致。
      onCreated()
    },
  })

  function handleOpenChange(o: boolean) {
    if (!o) {
      setLabel('')
      setNote('')
      m.reset()
    }
    onOpenChange(o)
  }

  function onSubmit() {
    m.mutate({ label, note })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="创建钱包">
      {m.data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono break-all">{m.data.address}</span>
            <CopyButton text={m.data.address} />
          </div>
          <p className="text-sm text-slate-600">请向该地址转入 USDG 作为跟单资金，并转入少量 ETH 作为 gas。</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="标签" htmlFor="wallet-label">
            <Input id="wallet-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="备注" htmlFor="wallet-note">
            <Textarea id="wallet-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={onSubmit} disabled={m.isPending}>
              创建
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
