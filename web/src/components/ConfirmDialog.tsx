import { Dialog } from './ui/dialog'
import { Button } from './ui/button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  destructive,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange(o: boolean): void
  title: string
  description: string
  confirmText?: string
  destructive?: boolean
  busy?: boolean
  onConfirm(): void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return
        onOpenChange(o)
      }}
      title={title}
      description={description}
      hideClose
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>
            {confirmText ?? '确定'}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
