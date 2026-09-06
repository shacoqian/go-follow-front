import * as React from 'react'
import type { ReactNode } from 'react'

export function Table({
  head,
  children,
  empty = '暂无数据',
}: {
  head: ReactNode[]
  children: ReactNode
  empty?: string
}) {
  const rows = React.Children.toArray(children)
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows
          ) : (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export const Tr = (p: React.HTMLAttributes<HTMLTableRowElement>) => <tr className="border-t border-slate-100" {...p} />
export const Td = (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="px-3 py-2 align-middle" {...p} />
export const Th = (p: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className="px-3 py-2 text-left font-medium" {...p} />
)
