import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type Operator } from '@/api/admin'
import { ApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, Tr, Td } from '@/components/ui/table'
import { CopyButton } from '@/components/CopyButton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { weiToEth } from '@/lib/amount'
import { shortAddress } from '@/lib/format'
import { addressUrl } from '@/lib/explorer'
import { adminKeys, useExecStatus, useOperators } from './useAdmin'
import { OperatorWithdrawDialog } from './OperatorWithdrawDialog'

type Action = 'enable' | 'delete' | 'withdraw' | 'disable'

// 未登记只能删除；已登记未启用可以启用/删除/提回；已启用可以停用/提回；
// 已摘除（自动摘除，可能仍是 enabled=true）只提供启用（恢复），不提供删除——
// 见后端 exec.OperatorPool：removed 与 enabled 是两个独立的状态，摘除优先展示。
function operatorActions(op: Operator): Action[] {
  if (op.removed) return ['enable']
  if (!op.registered) return ['delete']
  if (!op.enabled) return ['enable', 'delete', 'withdraw']
  return ['disable', 'withdraw']
}

export default function OperatorsPage() {
  const { data: operators, isLoading, isError } = useOperators()
  const { data: execStatus } = useExecStatus()
  const qc = useQueryClient()

  const [deleteTarget, setDeleteTarget] = useState<Operator | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: number; message: string } | null>(null)
  const [enableError, setEnableError] = useState<{ id: number; message: string } | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<Operator | null>(null)

  function invalidate() {
    qc.invalidateQueries({ queryKey: adminKeys.operators })
    qc.invalidateQueries({ queryKey: adminKeys.execStatus })
  }

  // 生成失败走全局 toast（无 meta.silent），成功另外提示地址。
  const createOp = useMutation({
    mutationFn: () => adminApi.createOperator(),
    onSuccess: (res) => {
      invalidate()
      toast.success(`已生成 ${shortAddress(res.address)}`)
    },
  })

  // 启用未登记时后端 409，行内展示，故 meta.silent；其余异常手动 toast。
  const setEnabled = useMutation({
    mutationFn: (vars: { id: number; on: boolean }) => adminApi.setOperatorEnabled(vars.id, vars.on),
    meta: { silent: true },
    onSuccess: (_res, vars) => {
      invalidate()
      setEnableError((e) => (e?.id === vars.id ? null : e))
    },
    onError: (err, vars) => {
      if (err instanceof ApiError) {
        setEnableError({ id: vars.id, message: err.message })
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  // 删除 409 内联展示 + 强制删除按钮，故 meta.silent；其余异常手动 toast。
  const deleteOp = useMutation({
    mutationFn: (vars: { id: number; force: boolean }) => adminApi.deleteOperator(vars.id, vars.force),
    meta: { silent: true },
    onSuccess: (_res, vars) => {
      invalidate()
      toast.success('已删除')
      setDeleteTarget(null)
      setDeleteError((e) => (e?.id === vars.id ? null : e))
    },
    onError: (err, vars) => {
      if (err instanceof ApiError) {
        setDeleteError({ id: vars.id, message: err.message })
        setDeleteTarget(null)
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  return (
    <div>
      <h1 className="text-xl font-semibold">Operator 钱包</h1>
      <p className="mt-1 text-sm text-slate-600">签所有跟单交易、只付 gas；生成后需在掌钥机登记再启用</p>
      {execStatus && (
        <p className="mt-2 text-sm text-slate-600">
          可用 operator {execStatus.operators_ready} · 授权缓存 {execStatus.allowance_cache_entries}
        </p>
      )}

      <div className="mt-4">
        <Button onClick={() => createOp.mutate()} disabled={createOp.isPending}>
          生成
        </Button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['地址', 'ETH 余额', '登记', '状态', '在途', '操作']}>
            {(operators ?? []).map((op) => {
              const url = addressUrl(op.address)
              const actions = operatorActions(op)
              return (
                <Tr key={op.id}>
                  <Td>
                    {url ? (
                      <a className="font-mono underline" href={url} target="_blank" rel="noreferrer">
                        {shortAddress(op.address)}
                      </a>
                    ) : (
                      <span className="font-mono">{shortAddress(op.address)}</span>
                    )}{' '}
                    <CopyButton text={op.address} />
                  </Td>
                  <Td>{op.eth_error ?? weiToEth(op.eth_balance)}</Td>
                  <Td>
                    <Badge tone={op.registered ? 'green' : 'amber'}>{op.registered ? '已登记' : '未登记'}</Badge>
                  </Td>
                  <Td>
                    {op.removed ? (
                      <Badge tone="red">{`已摘除：${op.removed_reason}`}</Badge>
                    ) : (
                      <Badge tone={op.enabled ? 'blue' : 'gray'}>{op.enabled ? '已启用' : '已停用'}</Badge>
                    )}
                  </Td>
                  <Td>{op.in_flight}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      {actions.includes('enable') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setEnabled.isPending}
                          onClick={() => setEnabled.mutate({ id: op.id, on: true })}
                        >
                          启用
                        </Button>
                      )}
                      {actions.includes('disable') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setEnabled.isPending}
                          onClick={() => setEnabled.mutate({ id: op.id, on: false })}
                        >
                          停用
                        </Button>
                      )}
                      {actions.includes('withdraw') && (
                        <Button size="sm" variant="ghost" onClick={() => setWithdrawTarget(op)}>
                          提回 ETH
                        </Button>
                      )}
                      {actions.includes('delete') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => {
                            setDeleteError((e) => (e?.id === op.id ? null : e))
                            setDeleteTarget(op)
                          }}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                    {enableError?.id === op.id && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {enableError.message}
                      </p>
                    )}
                    {deleteError?.id === op.id && (
                      <div role="alert" className="mt-1 space-y-1 text-xs text-red-600">
                        <p>{deleteError.message}</p>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deleteOp.isPending}
                          onClick={() => deleteOp.mutate({ id: op.id, force: true })}
                        >
                          强制删除
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Table>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title="删除 operator"
          description="删除后私钥无法找回，请确认已提回 ETH 并在掌钥机撤销登记"
          confirmText="确认删除"
          destructive
          busy={deleteOp.isPending}
          onConfirm={() => deleteOp.mutate({ id: deleteTarget.id, force: false })}
        />
      )}

      {withdrawTarget && (
        <OperatorWithdrawDialog
          open
          operator={withdrawTarget}
          onOpenChange={(o) => !o && setWithdrawTarget(null)}
          onSubmitted={invalidate}
        />
      )}
    </div>
  )
}
