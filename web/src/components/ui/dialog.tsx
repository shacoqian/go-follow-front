import * as RD from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from './button'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  hideClose,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  hideClose?: boolean
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RD.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg focus:outline-none">
          <RD.Title className="text-lg font-semibold">{title}</RD.Title>
          {description ? (
            <RD.Description className="mt-1 text-sm text-slate-600">{description}</RD.Description>
          ) : (
            <RD.Description className="sr-only">{title}</RD.Description>
          )}
          <div className="mt-4 space-y-3">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            {!hideClose && (
              <RD.Close asChild>
                <Button variant="outline">关闭</Button>
              </RD.Close>
            )}
            {footer}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
