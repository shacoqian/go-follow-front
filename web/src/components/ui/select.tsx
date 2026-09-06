import * as React from 'react'
import { cn } from '@/lib/cn'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }
>(({ options, className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn('h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm', className)}
    {...props}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
))
Select.displayName = 'Select'
