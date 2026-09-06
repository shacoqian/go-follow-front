import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const toneClasses = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
} as const

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: keyof typeof toneClasses
  children: ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', toneClasses[tone])}>
      {children}
    </span>
  )
}
