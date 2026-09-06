import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { isAddress } from 'viem'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { targetsApi, type Target } from '@/api/targets'

export function TargetDialog({
  open,
  onOpenChange,
  target,
  onSaved,
}: {
  open: boolean
  onOpenChange(o: boolean): void
  target?: Target
  onSaved(result?: { id: number; address: string }): void
}) {
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState(target?.label ?? '')
  const [note, setNote] = useState(target?.note ?? '')
  const [addressError, setAddressError] = useState('')

  // 走全局 mutationCache：失败自动 toast（如重复地址 409），这里不重复弹。
  const create = useMutation({
    mutationFn: (body: { address: string; label: string; note: string }) => targetsApi.create(body),
    // 创建把结果带给调用方（建单页要自动选中新目标）；编辑没有新 id，不传。
    onSuccess: (r) => {
      onSaved(r)
      toast.success('已保存')
      onOpenChange(false)
    },
  })
  const update = useMutation({
    mutationFn: (body: { label: string; note: string }) => targetsApi.update(target!.id, body),
    onSuccess: () => {
      onSaved()
      toast.success('已保存')
      onOpenChange(false)
    },
  })
  const isPending = create.isPending || update.isPending

  function onSubmit() {
    if (target) {
      update.mutate({ label, note })
      return
    }
    if (!isAddress(address)) {
      setAddressError('地址格式不正确')
      return
    }
    setAddressError('')
    create.mutate({ address, label, note })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={target ? '编辑目标' : '新增目标'}>
      <div className="space-y-3">
        {!target && (
          <Field label="地址" htmlFor="target-address" error={addressError}>
            <Input id="target-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        )}
        <Field label="标签" htmlFor="target-label">
          <Input id="target-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="备注" htmlFor="target-note">
          <Textarea id="target-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={isPending}>
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
