import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { toast } from '@/components/ui/toast'
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
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ id: number; address: string } | null>(null)

  function handleOpenChange(o: boolean) {
    if (!o) {
      setLabel('')
      setNote('')
      setResult(null)
    }
    onOpenChange(o)
  }

  async function onSubmit() {
    setBusy(true)
    try {
      const r = await walletsApi.create({ label, note })
      // 先失效列表，再切到结果视图——保证列表数据和用户看到的地址一致。
      onCreated()
      setResult(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="创建钱包">
      {result ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono break-all">{result.address}</span>
            <CopyButton text={result.address} />
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
            <Button onClick={onSubmit} disabled={busy}>
              创建
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
