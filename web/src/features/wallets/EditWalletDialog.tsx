import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { walletsApi, type Wallet } from '@/api/wallets'

export function EditWalletDialog({
  open,
  wallet,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  wallet: Wallet
  onOpenChange(o: boolean): void
  onSaved(): void
}) {
  const [label, setLabel] = useState(wallet.label)
  const [note, setNote] = useState(wallet.note)
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setBusy(true)
    try {
      await walletsApi.update(wallet.id, { label, note })
      onSaved()
      toast.success('已保存')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="编辑钱包">
      <div className="space-y-3">
        <Field label="标签" htmlFor="edit-wallet-label">
          <Input id="edit-wallet-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="备注" htmlFor="edit-wallet-note">
          <Textarea id="edit-wallet-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={busy}>
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
