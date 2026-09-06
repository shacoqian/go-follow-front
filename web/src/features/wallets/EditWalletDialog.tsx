import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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
  // 走全局 mutationCache：失败自动 toast（401 除外），这里不重复弹。
  const m = useMutation({
    mutationFn: (body: { label: string; note: string }) => walletsApi.update(wallet.id, body),
    onSuccess: () => {
      onSaved()
      toast.success('已保存')
      onOpenChange(false)
    },
  })

  function onSubmit() {
    m.mutate({ label, note })
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
          <Button onClick={onSubmit} disabled={m.isPending}>
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
