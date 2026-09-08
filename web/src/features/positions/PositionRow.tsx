import { useQuery } from '@tanstack/react-query'
import type { Position } from '@/api/positions'
import { decisionsApi } from '@/api/decisions'
import { healthApi } from '@/api/health'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tr, Td } from '@/components/ui/table'
import { CopyButton } from '@/components/CopyButton'
import { unitsToUsdg } from '@/lib/amount'
import { fmtPrice, shortAddress } from '@/lib/format'
import { addressUrl } from '@/lib/explorer'
import { exitBlockedText, positionInFlight, dryRunLeftover } from './exitState'

export function PositionRow({ position: p, onSell }: { position: Position; onSell(): void }) {
  const url = addressUrl(p.token)
  const blocked = exitBlockedText(p)

  // 与 Banner 共用 ['health'] 缓存：判断是否已从 dry-run 切到实盘。
  const health = useQuery({ queryKey: ['health'], queryFn: healthApi.get, refetchInterval: 10_000, meta: { silent: true } })
  // 决策没有 token 字段，只能按任务近似判断在途，见 exitState.ts 的 positionInFlight 注释。
  const decisions = useQuery({
    queryKey: ['decisions', p.task_id, 'recent'],
    queryFn: () => decisionsApi.list({ task: p.task_id, limit: 50 }),
    refetchInterval: 10_000,
    meta: { silent: true },
  })
  const inFlight = positionInFlight(p, decisions.data ?? [])
  const leftover = dryRunLeftover(p, health.data?.dry_run)

  return (
    <Tr>
      <Td>
        {url ? (
          <a className="font-mono underline" href={url} target="_blank" rel="noreferrer">
            {shortAddress(p.token)}
          </a>
        ) : (
          <span className="font-mono">{shortAddress(p.token)}</span>
        )}{' '}
        <CopyButton text={p.token} />
      </Td>
      {/* 代币精度未知，数量原样显示为原始整数字符串。 */}
      <Td>{p.qty}</Td>
      <Td>{unitsToUsdg(p.cost_usdg)}</Td>
      <Td>{fmtPrice(p.avg_price_usdg)}</Td>
      <Td>{unitsToUsdg(p.realized_usdg)}</Td>
      <Td>{p.addon_count}</Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {inFlight && <Badge tone="blue">在途</Badge>}
          {leftover ? <Badge tone="amber">dry-run 遗留</Badge> : p.virtual && <Badge tone="gray">dry-run</Badge>}
          {p.tp_done && <Badge tone="blue">已止盈</Badge>}
          {blocked && <Badge tone="amber">{blocked}</Badge>}
        </div>
      </Td>
      <Td>
        <Button size="sm" variant="ghost" disabled={p.qty === '0'} onClick={onSell}>
          卖出
        </Button>
      </Td>
    </Tr>
  )
}
