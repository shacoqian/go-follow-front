import { useQuery } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Table, Tr, Td } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/CopyButton'
import { walletsApi, type Wallet } from '@/api/wallets'
import { unitsToUsdg, weiToEth } from '@/lib/amount'
import { txUrl } from '@/lib/explorer'
import { shortAddress } from '@/lib/format'
import { statusText, statusTone } from './withdrawStatus'

export function WithdrawalHistoryDialog({
  wallet,
  open,
  onOpenChange,
}: {
  wallet: Wallet
  open: boolean
  onOpenChange(o: boolean): void
}) {
  // 提现记录列表：打开对话框才查询，10s 轮询跟进未终态记录的最新状态。
  // 失败下面已就地显示“加载失败”，再走全局 toast 只是噪音，故 meta.silent。
  const { data, isLoading, isError } = useQuery({
    queryKey: ['withdrawals', wallet.id],
    queryFn: () => walletsApi.withdrawals(wallet.id),
    enabled: open,
    meta: { silent: true },
    refetchInterval: 10_000,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="提现记录">
      {isLoading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">加载失败</p>
      ) : (
        <Table head={['时间', '资产', '金额', '状态', '哈希', '错误']}>
          {(data ?? []).map((wd) => {
            const url = txUrl(wd.tx_hash)
            return (
              <Tr key={wd.id}>
                <Td>{new Date(wd.created_at).toLocaleString()}</Td>
                <Td>{wd.asset}</Td>
                <Td>{wd.asset === 'USDG' ? unitsToUsdg(wd.amount) : weiToEth(wd.amount)}</Td>
                <Td>
                  <Badge tone={statusTone(wd.status)}>{statusText(wd.status)}</Badge>
                </Td>
                <Td>
                  {wd.tx_hash ? (
                    url ? (
                      <a className="font-mono underline" href={url} target="_blank" rel="noreferrer">
                        {shortAddress(wd.tx_hash)}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono">{shortAddress(wd.tx_hash)}</span>
                        <CopyButton text={wd.tx_hash} />
                      </span>
                    )
                  ) : (
                    '-'
                  )}
                </Td>
                <Td>{wd.error || '-'}</Td>
              </Tr>
            )
          })}
        </Table>
      )}
    </Dialog>
  )
}
