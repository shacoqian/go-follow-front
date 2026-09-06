import { create } from 'zustand'
import { cn } from '@/lib/cn'

type Kind = 'error' | 'success' | 'info'
interface Item { id: number; kind: Kind; message: string }
interface ToastState { items: Item[]; push(kind: Kind, message: string): void; remove(id: number): void }

let seq = 0
export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = ++seq
    set((s) => ({ items: [...s.items, { id, kind, message }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 4000)
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  error: (m: string) => useToasts.getState().push('error', m),
  success: (m: string) => useToasts.getState().push('success', m),
  info: (m: string) => useToasts.getState().push('info', m),
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  const remove = useToasts((s) => s.remove)
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {items.map((i) => (
        <div
          key={i.id}
          onClick={() => remove(i.id)}
          className={cn(
            'pointer-events-auto cursor-pointer rounded-md border px-4 py-3 text-sm shadow',
            i.kind === 'error' && 'border-red-200 bg-red-50 text-red-800',
            i.kind === 'success' && 'border-green-200 bg-green-50 text-green-800',
            i.kind === 'info' && 'border-slate-200 bg-white text-slate-800',
          )}
        >
          {i.message}
        </div>
      ))}
    </div>
  )
}
