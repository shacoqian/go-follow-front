import type { Wallet } from '@/api/wallets'
import { unitsToUsdg, weiToEth } from '@/lib/amount'
import { shortAddress } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tr, Td } from '@/components/ui/table'
import { CopyButton } from '@/components/CopyButton'

export function WalletRow({
  wallet: w,
  onEdit,
  onDisable,
  onExport,
  onDelete,
  onWithdraw,
  onHistory,
}: {
  wallet: Wallet
  onEdit(): void
  onDisable(): void
  onExport(): void
  onDelete(): void
  onWithdraw(): void
  onHistory(): void
}) {
  const bal = (v: string | null, f: (x: string | null) => string) => (w.balance_error ? '读取失败' : f(v))
  return (
    <Tr>
      <Td>
        <div className="font-medium">{w.label || '（未命名）'}</div>
        {w.note && <div className="text-xs text-slate-500">{w.note}</div>}
      </Td>
      <Td>
        <span className="font-mono">{shortAddress(w.address)}</span> <CopyButton text={w.address} />
      </Td>
      <Td>{bal(w.usdg_balance, unitsToUsdg)}</Td>
      <Td>{bal(w.eth_balance, weiToEth)}</Td>
      <Td>{w.task_count}</Td>
      <Td>
        {w.status === 'disabled' ? <Badge tone="gray">已禁用</Badge> : <Badge tone="green">正常</Badge>}
        {w.has_pending_withdrawal && <Badge tone="amber">提现中</Badge>}
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>编辑</Button>
          {w.status === 'active' && (
            <Button size="sm" variant="ghost" onClick={onDisable}>禁用</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onWithdraw}>提现</Button>
          <Button size="sm" variant="ghost" onClick={onHistory}>提现记录</Button>
          <Button size="sm" variant="ghost" onClick={onExport}>导出</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={onDelete}>删除</Button>
        </div>
      </Td>
    </Tr>
  )
}
