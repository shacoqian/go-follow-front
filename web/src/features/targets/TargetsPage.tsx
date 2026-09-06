import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Table, Tr, Td } from '@/components/ui/table'
import { CopyButton } from '@/components/CopyButton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { shortAddress } from '@/lib/format'
import { targetsApi, type Target } from '@/api/targets'
import { tasksApi } from '@/api/tasks'
import { useTargets, useInvalidateTargets } from './useTargets'
import { TargetDialog } from './TargetDialog'

type DialogState = { kind: 'create' } | { kind: 'edit' | 'delete'; target: Target } | null

export default function TargetsPage() {
  const { data, isLoading, isError } = useTargets()
  const { data: tasks } = useQuery({ queryKey: ['tasks'], queryFn: tasksApi.list })
  const invalidate = useInvalidateTargets()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const taskCount = (targetId: number) => (tasks ?? []).filter((t) => t.target_id === targetId).length

  function openDelete(t: Target) {
    setDeleteError(null)
    setDialog({ kind: 'delete', target: t })
    setDeleteOpen(true)
  }

  function closeDelete() {
    setDeleteOpen(false)
    setDialog(null)
    setDeleteError(null)
  }

  // 409（仍被任务引用）需要把原文精确展示给用户，就地展示而不走全局 toast（meta.silent），与
  // DeleteWalletDialog 的既有约定一致；成功则失效列表并关闭对话框。
  // 出错时先把 Radix 对话框关掉（否则它给背景打的 aria-hidden 会把提示条一起藏进无障碍树外），
  // 再用页面里的提示条展示原文；dialog/deleteError 都留着，再次点“删除”会重置并重新打开。
  const removeTarget = useMutation({
    mutationFn: (id: number) => targetsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      invalidate()
      closeDelete()
    },
    onError: (err) => {
      setDeleteOpen(false)
      setDeleteError(err instanceof Error ? err.message : '操作失败')
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">目标</h1>
        <Button onClick={() => setDialog({ kind: 'create' })}>新增目标</Button>
      </div>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['地址', '标签', '备注', '任务数', '操作']}>
            {(data ?? []).map((t) => (
              <Tr key={t.id}>
                <Td>
                  <span className="font-mono">{shortAddress(t.address)}</span> <CopyButton text={t.address} />
                </Td>
                <Td>{t.label}</Td>
                <Td>{t.note}</Td>
                <Td>{taskCount(t.id)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'edit', target: t })}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => openDelete(t)}
                    >
                      删除
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {dialog?.kind === 'create' && (
        <TargetDialog open onOpenChange={(o) => !o && setDialog(null)} onSaved={invalidate} />
      )}
      {dialog?.kind === 'edit' && (
        <TargetDialog
          open
          target={dialog.target}
          onOpenChange={(o) => !o && setDialog(null)}
          onSaved={invalidate}
        />
      )}
      {dialog?.kind === 'delete' && (
        <>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={(o) => !o && closeDelete()}
            title="删除目标"
            description="删除后不可恢复。"
            confirmText="确认删除"
            destructive
            busy={removeTarget.isPending}
            onConfirm={() => removeTarget.mutate(dialog.target.id)}
          />
          {deleteError && (
            <div role="alert" className="fixed inset-x-0 top-4 z-50 mx-auto w-fit rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
              {deleteError}
            </div>
          )}
        </>
      )}
    </div>
  )
}
