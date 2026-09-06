import * as React from 'react'

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string }>(
  ({ label, ...props }, ref) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" ref={ref} {...props} />
      {label}
    </label>
  ),
)
Checkbox.displayName = 'Checkbox'
