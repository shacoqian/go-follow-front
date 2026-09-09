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

// 未登记只能删除；已登记未启用可以启用/删除/提回；已启用可以停用/提回。
// 已摘除是自动摘除（连续失败），与 enabled 是两个独立的后端状态，摘除时按当前
// enabled 再分两种：removed&&enabled 只给启用(恢复)/停用；removed&&!enabled
// 只给启用/删除（未登记时后端删除唯一接受的动作就是删除本身，其余都会 409）。
// 两种摘除态都不给「提回 ETH」——摘除多半意味着这把还没理清楚状态，先别动钱。
function operatorActions(op: Operator): Action[] {
  if (op.removed) return op.enabled ? ['enable', 'disable'] : ['enable', 'delete']
  if (!op.registered) return ['delete']
  if (!op.enabled) return ['enable', 'delete', 'withdraw']
  return ['disable', 'withdraw']
}

// DELETE /admin/operators/:id 的 409 里，「请先停用该 operator」「仍有在途交易」在
// 后端读 force 参数之前就返回（分别对应 st.Enabled / st.InFlight>0 两道闸），带
// force=1 重试毫无意义；其余四种——链上登记状态未知、请先在掌钥机撤销登记、余额未知、
// 钱包仍有余额请先提回——都在 !force 分支里，force=1 能绕过，才展示「强制删除」。
const FORCE_BYPASSABLE_DELETE_ERRORS = new Set([
  '链上登记状态未知，请稍后重试或带 force=1',
  '请先在掌钥机撤销登记',
  '余额未知',
  '钱包仍有余额，请先提回',
])

export default function OperatorsPage() {
  const { data: operators, isLoading, isError } = useOperators()
  const { data: execStatus } = useExecStatus()
  const qc = useQueryClient()

  const [deleteTarget, setDeleteTarget] = useState<Operator | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({})
  const [enableErrors, setEnableErrors] = useState<Record<number, string>>({})
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

  const refreshOps = useMutation({
    mutationFn: () => adminApi.refreshOperators(),
    onSuccess: (res) => {
      invalidate()
      toast.success(`已刷新：共 ${res.total} 把，可用 ${res.ready} 把`)
    },
  })

  // 启用未登记时后端 409，行内展示，故 meta.silent；其余异常手动 toast。
  // 成功后清空全部行内错误：列表已刷新，残留在别的行上的旧错误不再可信，别让它一直挂着。
  const setEnabled = useMutation({
    mutationFn: (vars: { id: number; on: boolean }) => adminApi.setOperatorEnabled(vars.id, vars.on),
    meta: { silent: true },
    onSuccess: () => {
      invalidate()
      setEnableErrors({})
    },
    onError: (err, vars) => {
      if (err instanceof ApiError) {
        setEnableErrors((e) => ({ ...e, [vars.id]: err.message }))
      } else {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  // 删除 409 内联展示 + （视错误原因）强制删除按钮，故 meta.silent；其余异常手动 toast。
  const deleteOp = useMutation({
    mutationFn: (vars: { id: number; force: boolean }) => adminApi.deleteOperator(vars.id, vars.force),
    meta: { silent: true },
    onSuccess: () => {
      invalidate()
      toast.success('已删除')
      setDeleteTarget(null)
      setDeleteErrors({})
    },
    onError: (err, vars) => {
      if (err instanceof ApiError) {
        setDeleteErrors((e) => ({ ...e, [vars.id]: err.message }))
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

      <div className="mt-4 flex gap-2">
        <Button onClick={() => createOp.mutate()} disabled={createOp.isPending}>
          生成
        </Button>
        {/* 日常用不到：打开本页时后端已自动重读「未登记」的那些登记状态。
            留这个按钮是为了罕见运维——比如掌钥机撤销了某把的登记，那种情况自动刷新不覆盖
            （已登记的不会被重查，否则每次开页面都要对全池发一轮 eth_call）。 */}
        <Button variant="ghost" onClick={() => refreshOps.mutate()} disabled={refreshOps.isPending}>
          {refreshOps.isPending ? '刷新中…' : '刷新登记状态'}
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
              const enablePending = setEnabled.isPending && setEnabled.variables?.id === op.id
              const deletePending = deleteOp.isPending && deleteOp.variables?.id === op.id
              const deleteError = deleteErrors[op.id]
              const canForceDelete = deleteError !== undefined && FORCE_BYPASSABLE_DELETE_ERRORS.has(deleteError)
              return (
                <Tr key={op.id}>
                  {/* 这一列刻意显示完整地址而不是缩写：登记 operator 要把地址原样敲进掌钥机的
                      命令行（./app.sh operator <chain> <地址> true），缩写就得依赖复制按钮，
                      而复制在纯 HTTP 下曾经整个失效。全量文本 + 可选中是最后的兜底。 */}
                  <Td>
                    {url ? (
                      <a className="font-mono text-xs break-all underline" href={url} target="_blank" rel="noreferrer">
                        {op.address}
                      </a>
                    ) : (
                      <span className="font-mono text-xs break-all select-all">{op.address}</span>
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
                          disabled={enablePending}
                          onClick={() => setEnabled.mutate({ id: op.id, on: true })}
                        >
                          启用
                        </Button>
                      )}
                      {actions.includes('disable') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={enablePending}
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
                            setDeleteErrors((e) => {
                              if (!(op.id in e)) return e
                              const { [op.id]: _drop, ...rest } = e
                              return rest
                            })
                            setDeleteTarget(op)
                          }}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                    {enableErrors[op.id] && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {enableErrors[op.id]}
                      </p>
                    )}
                    {deleteError && (
                      <div role="alert" className="mt-1 space-y-1 text-xs text-red-600">
                        <p>{deleteError}</p>
                        {canForceDelete && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deletePending}
                            onClick={() => deleteOp.mutate({ id: op.id, force: true })}
                          >
                            强制删除
                          </Button>
                        )}
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
          busy={deleteOp.isPending && deleteOp.variables?.id === deleteTarget.id}
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
