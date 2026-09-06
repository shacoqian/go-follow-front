import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { walletsApi, type Wallet } from '@/api/wallets'
import { useWallets, useInvalidateWallets } from './useWallets'
import { WalletRow } from './WalletRow'
import { CreateWalletDialog } from './CreateWalletDialog'
import { EditWalletDialog } from './EditWalletDialog'

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit' | 'disable' | 'export' | 'delete' | 'withdraw' | 'history'; wallet: Wallet }
  | null

export default function WalletsPage() {
  const { data, isLoading, isError } = useWallets()
  const invalidate = useInvalidateWallets()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [disabling, setDisabling] = useState(false)

  async function onConfirmDisable() {
    if (!dialog || dialog.kind !== 'disable') return
    setDisabling(true)
    try {
      await walletsApi.disable(dialog.wallet.id)
      await invalidate()
      setDialog(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">钱包</h1>
        <Button onClick={() => setDialog({ kind: 'create' })}>创建钱包</Button>
      </div>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['标签', '地址', 'USDG', 'ETH', '任务数', '状态', '操作']}>
            {(data ?? []).map((w) => (
              <WalletRow
                key={w.id}
                wallet={w}
                onEdit={() => setDialog({ kind: 'edit', wallet: w })}
                onDisable={() => setDialog({ kind: 'disable', wallet: w })}
                onExport={() => setDialog({ kind: 'export', wallet: w })}
                onDelete={() => setDialog({ kind: 'delete', wallet: w })}
                onWithdraw={() => setDialog({ kind: 'withdraw', wallet: w })}
                onHistory={() => setDialog({ kind: 'history', wallet: w })}
              />
            ))}
          </Table>
        )}
      </div>

      {dialog?.kind === 'create' && (
        <CreateWalletDialog open onOpenChange={(o) => !o && setDialog(null)} onCreated={invalidate} />
      )}
      {dialog?.kind === 'edit' && (
        <EditWalletDialog open wallet={dialog.wallet} onOpenChange={(o) => !o && setDialog(null)} onSaved={invalidate} />
      )}
      {dialog?.kind === 'disable' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="禁用钱包"
          description="禁用后该钱包不再参与跟单，已有任务保持原样。"
          confirmText="确认禁用"
          busy={disabling}
          onConfirm={onConfirmDisable}
        />
      )}
      {dialog?.kind === 'export' && null}
      {dialog?.kind === 'delete' && null}
      {dialog?.kind === 'withdraw' && null}
      {dialog?.kind === 'history' && null}
    </div>
  )
}
