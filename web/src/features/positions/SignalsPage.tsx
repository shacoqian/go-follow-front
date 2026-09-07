import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

const VIA_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'self', label: '本人' },
  { value: 'relay', label: '代发' },
]

function fmtQuote(asset: string, amount: string, quoteToken: string): string {
  if (asset === 'ETH') return `${weiToEth(amount)} ETH`
  if (asset === 'USDG') return `${unitsToUsdg(amount)} USDG`
  if (asset === 'TOKEN') return `${amount} ${shortAddress(quoteToken)}（代币）`
  return `${amount} ${asset}`
}

export default function SignalsPage() {
  const { data: targets } = useTargets()

  const [target, setTarget] = useState('')
  const [via, setVia] = useState<'' | 'self' | 'relay'>('')
  const [limit, setLimit] = useState(LIMIT_START)

  const params = { ...(target ? { target } : {}), ...(via ? { via } : {}), limit }
  const query = useQuery({
    queryKey: ['signals', target, via, limit],
    queryFn: () => signalsApi.list(params),
    refetchInterval: 10_000,
    meta: { silent: true },
    placeholderData: keepPreviousData,
  })

  const targetOptions = (targets ?? []).map((t) => ({
    value: t.address.toLowerCase(),
    label: t.label ? `${t.label} ${shortAddress(t.address)}` : shortAddress(t.address),
  }))
  const rows = query.data ?? []
  const canLoadMore = limit < LIMIT_MAX && rows.length >= limit

  return (
    <div>
      <h1 className="text-xl font-semibold">信号</h1>
      <div className="mt-4 flex max-w-xl gap-4">
        <div className="flex-1">
          <Field label="目标" htmlFor="signal-target">
            <Select
              id="signal-target"
              options={[{ value: '', label: '全部' }, ...targetOptions]}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="来源" htmlFor="signal-via">
            <Select
              id="signal-via"
              options={VIA_OPTIONS}
              value={via}
              onChange={(e) => setVia(e.target.value as '' | 'self' | 'relay')}
            />
          </Field>
        </div>
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
              const targetUrl = addressUrl(s.target_addr)
              return (
                <Tr key={s.id}>
                  <Td>{fmtTime(s.seen_at)}</Td>
                  <Td>{s.block}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {targetUrl ? (
                        <a className="font-mono underline" href={targetUrl} target="_blank" rel="noreferrer">
                          {shortAddress(s.target_addr)}
                        </a>
                      ) : (
                        <span className="font-mono">{shortAddress(s.target_addr)}</span>
                      )}
                      {s.via === 'relay' ? (
                        <Badge tone="blue" title={`发送方 ${shortAddress(s.tx_from)}`}>
                          代发
                        </Badge>
                      ) : (
                        <Badge tone="gray">本人</Badge>
                      )}
                    </span>
                  </Td>
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
                  <Td>{fmtQuote(s.quote_asset, s.quote_amount, s.quote_token)}</Td>
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
