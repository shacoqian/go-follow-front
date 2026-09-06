import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Table, Tr, Td } from '@/components/ui/table'
import { CopyButton } from '@/components/CopyButton'
import { signalsApi } from '@/api/signals'
import { useTargets } from '@/features/targets/useTargets'
import { unitsToUsdg, weiToEth } from '@/lib/amount'
import { fmtTime, shortAddress } from '@/lib/format'
import { addressUrl } from '@/lib/explorer'

const LIMIT_START = 50
const LIMIT_STEP = 50
const LIMIT_MAX = 1000

function fmtQuote(asset: string, amount: string): string {
  if (asset === 'ETH') return `${weiToEth(amount)} ETH`
  if (asset === 'USDG') return `${unitsToUsdg(amount)} USDG`
  return `${amount} ${asset}`
}

export default function SignalsPage() {
  const { data: targets } = useTargets()

  const [target, setTarget] = useState('')
  const [limit, setLimit] = useState(LIMIT_START)

  const params = { ...(target ? { target } : {}), limit }
  const query = useQuery({
    queryKey: ['signals', target, limit],
    queryFn: () => signalsApi.list(params),
    refetchInterval: 10_000,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })

  const targetOptions = (targets ?? []).map((t) => ({
    value: t.address.toLowerCase(),
    label: `${t.label || shortAddress(t.address)} ${shortAddress(t.address)}`,
  }))
  const rows = query.data ?? []
  const canLoadMore = limit < LIMIT_MAX && rows.length >= limit

  return (
    <div>
      <h1 className="text-xl font-semibold">信号</h1>
      <div className="mt-4 max-w-xs">
        <Field label="目标" htmlFor="signal-target">
          <Select
            id="signal-target"
            options={[{ value: '', label: '全部' }, ...targetOptions]}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : query.isError ? (
          <p className="text-sm text-red-600">加载失败</p>
        ) : (
          <Table head={['时间', '块号', '目标', '方向', '代币', '数量', '计价', '场所']}>
            {rows.map((s) => {
              const url = addressUrl(s.token)
              return (
                <Tr key={s.id}>
                  <Td>{fmtTime(s.seen_at)}</Td>
                  <Td>{s.block}</Td>
                  <Td>{shortAddress(s.target_addr)}</Td>
                  <Td>{s.side}</Td>
                  <Td>
                    {url ? (
                      <a className="font-mono underline" href={url} target="_blank" rel="noreferrer">
                        {shortAddress(s.token)}
                      </a>
                    ) : (
                      <span className="font-mono">{shortAddress(s.token)}</span>
                    )}{' '}
                    <CopyButton text={s.token} />
                  </Td>
                  <Td>{s.token_amount}</Td>
                  <Td>{fmtQuote(s.quote_asset, s.quote_amount)}</Td>
                  <Td>{s.venue}</Td>
                </Tr>
              )
            })}
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
