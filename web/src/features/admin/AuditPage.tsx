import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, Tr, Td } from '@/components/ui/table'
import { fmtTime, shortAddress } from '@/lib/format'
import { adminKeys } from './useAdmin'

const ACTIONS = [
  'login',
  'logout',
  'action_sign',
  'wallet_create',
  'wallet_export',
  'wallet_delete',
  'withdraw',
  'task_create',
  'task_update',
  'task_enable',
  'task_disable',
  'task_delete',
  'admin_task_disable',
  'admin_task_enable',
  'admin_user_lock',
  'admin_user_unlock',
  'setting_update',
]

const LIMIT_START = 50
const LIMIT_STEP = 50
const LIMIT_MAX = 1000

export default function AuditPage() {
  const [ownerInput, setOwnerInput] = useState('')
  const [owner, setOwner] = useState('')
  const [action, setAction] = useState('')
  const [limit, setLimit] = useState(LIMIT_START)

  // 用户名输入回车/失焦才提交，避免每敲一个字符就重新拉取审计日志。
  function commitOwner() {
    setOwner(ownerInput.trim())
    setLimit(LIMIT_START)
  }

  const params = { ...(owner ? { owner } : {}), ...(action ? { action } : {}), limit }
  const query = useQuery({
    queryKey: adminKeys.audit(owner, action, limit),
    queryFn: () => adminApi.audit(params),
    refetchInterval: 10_000,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })

  const rows = query.data ?? []
  const canLoadMore = limit < LIMIT_MAX && rows.length >= limit

  return (
    <div>
      <h1 className="text-xl font-semibold">审计</h1>
      <div className="mt-4 flex max-w-lg gap-4">
        <Field label="用户" htmlFor="audit-owner">
          <Input
            id="audit-owner"
            value={ownerInput}
            placeholder="0x…"
            onChange={(e) => setOwnerInput(e.target.value)}
            onBlur={commitOwner}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitOwner()
            }}
          />
        </Field>
        <Field label="动作" htmlFor="audit-action">
          <Select
            id="audit-action"
            options={[{ value: '', label: '全部' }, ...ACTIONS.map((a) => ({ value: a, label: a }))]}
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setLimit(LIMIT_START)
            }}
          />
        </Field>
      </div>
      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : query.isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['时间', '用户', '动作', '详情', 'IP']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{fmtTime(r.created_at)}</Td>
                <Td>{shortAddress(r.owner)}</Td>
                <Td>{r.action}</Td>
                <Td>{r.detail}</Td>
                <Td>{r.ip}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
      {canLoadMore && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => Math.min(l + LIMIT_STEP, LIMIT_MAX))}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  )
}
