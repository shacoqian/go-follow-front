import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi, type AdminUser } from '@/api/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Table, Tr, Td } from '@/components/ui/table'
import { fmtTime, shortAddress } from '@/lib/format'
import { adminKeys, useAdminUsers } from './useAdmin'

type PendingAction = { user: AdminUser; kind: 'lock' | 'unlock' }

export default function UsersPage() {
  const { data: users, isLoading, isError } = useAdminUsers()
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingAction | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: adminKeys.users })

  const lock = useMutation({
    mutationFn: (address: string) => adminApi.lockUser(address),
    onSuccess: () => {
      invalidate()
      setPending(null)
    },
  })
  const unlock = useMutation({
    mutationFn: (address: string) => adminApi.unlockUser(address),
    onSuccess: () => {
      invalidate()
      setPending(null)
    },
  })

  function onConfirm() {
    if (!pending) return
    if (pending.kind === 'lock') lock.mutate(pending.user.address)
    else unlock.mutate(pending.user.address)
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">用户</h1>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['地址', '角色', '状态', '钱包数', '任务数', '开仓数', '最近登录', '最近创建', '操作']}>
            {(users ?? []).map((u) => (
              <Tr key={u.address}>
                <Td>
                  <Link to={`/admin/data?owner=${u.address}`} className="font-mono text-xs text-slate-700 underline">
                    {shortAddress(u.address)}
                  </Link>
                </Td>
                <Td>{u.role === 'admin' ? '管理员' : '普通用户'}</Td>
                <Td>{u.locked ? <Badge tone="red">已锁定</Badge> : <Badge tone="green">正常</Badge>}</Td>
                <Td>{u.wallets}</Td>
                <Td>{u.tasks}</Td>
                <Td>{u.positions_open}</Td>
                <Td>{fmtTime(u.last_login_at)}</Td>
                <Td>{fmtTime(u.created_at)}</Td>
                <Td>
                  {u.locked ? (
                    <Button size="sm" variant="ghost" onClick={() => setPending({ user: u, kind: 'unlock' })}>
                      解锁
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setPending({ user: u, kind: 'lock' })}>
                      锁定
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.kind === 'lock' ? '锁定用户' : '解锁用户'}
          description={pending.kind === 'lock' ? '锁定后该用户无法登录，已在途的提现不受影响' : '解锁后该用户可重新登录'}
          confirmText={pending.kind === 'lock' ? '确认锁定' : '确认解锁'}
          destructive={pending.kind === 'lock'}
          busy={lock.isPending || unlock.isPending}
          onConfirm={onConfirm}
        />
      )}
    </div>
  )
}
