import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi, type LogEntry } from '@/api/admin'
import { ApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, Tr, Td } from '@/components/ui/table'
import { fmtTime } from '@/lib/format'

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const DEFAULT_LIMIT = 100
// 展开行时隐藏的核心字段——后端保证每条至少有这些，其余任意字段才值得单独展示。
const CORE_KEYS = new Set(['ts', 'level', 'module', 'msg', 'caller'])

interface LogsParams {
  q?: string
  level?: string
  from?: string
  to?: string
  limit: number
  dedup?: string
}

function strField(entry: LogEntry, key: string): string {
  const v = entry[key]
  return v === undefined || v === null ? '' : String(v)
}

// 值为对象（含数组）时用 JSON.stringify 展开，其余原样转字符串。
function fmtExtraValue(v: unknown): string {
  if (v !== null && typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function extraFields(entry: LogEntry): [string, string][] {
  return Object.entries(entry)
    .filter(([k]) => !CORE_KEYS.has(k))
    .map(([k, v]) => [k, fmtExtraValue(v)])
}

function levelTone(level: string): 'red' | 'amber' | 'gray' {
  switch (level.toUpperCase()) {
    case 'ERROR':
      return 'red'
    case 'WARN':
    case 'WARNING':
      return 'amber'
    default:
      return 'gray'
  }
}

// datetime-local 的值不带时区，Date 按本地时区解释；toISOString() 转成同一时刻的 UTC/RFC3339 表示。
function toRFC3339(local: string): string {
  return new Date(local).toISOString()
}

export default function LogsPage() {
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [dedup, setDedup] = useState('')
  const [submitted, setSubmitted] = useState<LogsParams | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'logs', submitted],
    queryFn: () => adminApi.logs(submitted!),
    enabled: submitted !== null,
    meta: { silent: true },
  })

  function onSubmit() {
    setExpanded(null)
    setSubmitted({
      q: q.trim() || undefined,
      level: level || undefined,
      from: from ? toRFC3339(from) : undefined,
      to: to ? toRFC3339(to) : undefined,
      limit,
      dedup: dedup.trim() || undefined,
    })
  }

  const entries = query.data?.entries ?? []

  return (
    <div>
      <h1 className="text-xl font-semibold">日志</h1>
      <div className="mt-4 flex max-w-4xl flex-wrap items-end gap-4">
        <Field label="关键字" htmlFor="logs-q">
          <Input
            id="logs-q"
            value={q}
            placeholder="逗号分隔，多个关键字同时满足"
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Field label="级别" htmlFor="logs-level">
          <Select
            id="logs-level"
            options={[{ value: '', label: '全部' }, ...LEVELS.map((l) => ({ value: l, label: l }))]}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </Field>
        <Field label="开始时间" htmlFor="logs-from">
          <Input id="logs-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="结束时间" htmlFor="logs-to">
          <Input id="logs-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="条数" htmlFor="logs-limit">
          <Input
            id="logs-limit"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(e.target.value === '' ? DEFAULT_LIMIT : Number(e.target.value))}
          />
        </Field>
        <Field label="去重字段" htmlFor="logs-dedup">
          <Input id="logs-dedup" value={dedup} onChange={(e) => setDedup(e.target.value)} />
        </Field>
        <Button onClick={onSubmit}>查询</Button>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : query.isError ? (
          <p role="alert" className="text-sm text-red-600">
            {query.error instanceof ApiError ? query.error.message : '加载失败'}
          </p>
        ) : query.data ? (
          <>
            <p className="mb-2 text-sm text-slate-600">
              共{' '}
              <span title="按文件尾部有限扫描的匹配数">{query.data.total}</span> 条，扫描 {query.data.files.length}{' '}
              个文件
            </p>
            <Table head={['时间', '级别', '模块', '消息']} empty="没有匹配的日志">
              {entries.flatMap((entry, i) => {
                const rowLevel = strField(entry, 'level')
                const rows = [
                  <Tr key={`row-${i}`} className="cursor-pointer" onClick={() => setExpanded(expanded === i ? null : i)}>
                    <Td>{fmtTime(strField(entry, 'ts'))}</Td>
                    <Td>
                      <Badge tone={levelTone(rowLevel)}>{rowLevel}</Badge>
                    </Td>
                    <Td>{strField(entry, 'module')}</Td>
                    <Td>{strField(entry, 'msg')}</Td>
                  </Tr>,
                ]
                if (expanded === i) {
                  const extra = extraFields(entry)
                  rows.push(
                    <tr key={`extra-${i}`} className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={4} className="px-3 py-2">
                        {extra.length ? (
                          <ul className="space-y-0.5 text-xs">
                            {extra.map(([k, v]) => (
                              <li key={k}>
                                <span className="font-mono text-slate-500">{k}</span>: <span className="break-all">{v}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-400">无附加字段</p>
                        )}
                      </td>
                    </tr>,
                  )
                }
                return rows
              })}
            </Table>
          </>
        ) : null}
      </div>
    </div>
  )
}
