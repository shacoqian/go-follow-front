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
import { positionPnl } from './pnl'

export function PositionRow({
  position: p,
  taskLabel,
  onSell,
  onAbandon,
}: {
  position: Position
  // taskLabel 由页面算好传进来：总览页跨任务列仓位，行里必须能看出这笔属于谁。
  taskLabel: string
  onSell(): void
  onAbandon(): void
}) {
  const url = addressUrl(p.token)
  const blocked = exitBlockedText(p)

  // 与 Banner 共用 ['health'] 缓存：判断是否已从 dry-run 切到实盘。
  const health = useQuery({ queryKey: ['health'], queryFn: healthApi.get, refetchInterval: 10_000, meta: { silent: true } })
  // 按 (task_id, token) 精确匹配最近决策判断在途，见 exitState.ts 的 positionInFlight。
  const decisions = useQuery({
    queryKey: ['decisions', p.task_id, 'recent'],
    queryFn: () => decisionsApi.list({ task: p.task_id, limit: 50 }),
    refetchInterval: 10_000,
    meta: { silent: true },
  })
  const inFlight = positionInFlight(p, decisions.data ?? [])
  const leftover = dryRunLeftover(p, health.data?.dry_run)

  const holding = p.qty !== '0' && !p.abandoned
  const pnl = positionPnl(p)
  // 估不出市值时显示「无法估值」而不是 0：那不是"值 0"，是"报不出价"，
  // 两者对用户的含义完全不同。已清仓/已核销没有持仓，市值本来就是空的。
  const valueText = !holding ? '—' : p.value_usdg === null ? '无法估值' : unitsToUsdg(p.value_usdg)
  const pnlText = pnl.pct === null ? '—' : `${pnl.pct >= 0 ? '+' : ''}${(pnl.pct * 100).toFixed(1)}%`
  const pnlClass = pnl.pct === null ? 'text-slate-400' : pnl.pct >= 0 ? 'text-emerald-600' : 'text-red-600'
  // 「关闭」只给卖不掉的活仓位：能估出价就该走卖出，别用核销把还能换钱的仓位一笔勾销。
  const canAbandon = holding && p.value_usdg === null

  return (
    <Tr>
      <Td>
        <span className="whitespace-nowrap">{taskLabel}</span>
      </Td>
      <Td>
        {/* symbol 只是显示名，合约可以随便取——地址才是身份，所以两者都摆出来。
            今天实测过一个 symbol=NVDA、name="Next Viral Dog Asset" 的冒牌货。 */}
        {p.symbol && <span className="mr-1 font-medium">{p.symbol}</span>}
        {url ? (
          <a className="font-mono text-xs underline" href={url} target="_blank" rel="noreferrer">
            {shortAddress(p.token)}
          </a>
        ) : (
          <span className="font-mono text-xs">{shortAddress(p.token)}</span>
        )}{' '}
        <CopyButton text={p.token} />
      </Td>
      {/* 代币精度未知，数量原样显示为原始整数字符串。 */}
      <Td>{p.qty}</Td>
      <Td>{unitsToUsdg(p.invested_usdg)}</Td>
      <Td>{valueText}</Td>
      <Td>
        <span className={pnlClass}>{pnlText}</span>
      </Td>
      <Td>{fmtPrice(p.avg_price_usdg)}</Td>
      <Td>{p.addon_count}</Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {inFlight && <Badge tone="blue">在途</Badge>}
          {leftover ? <Badge tone="amber">dry-run 遗留</Badge> : p.virtual && <Badge tone="gray">dry-run</Badge>}
          {p.tp_done && <Badge tone="blue">已止盈</Badge>}
          {p.abandoned && <Badge tone="gray">已核销</Badge>}
          {blocked && <Badge tone="amber">{blocked}</Badge>}
        </div>
      </Td>
      <Td>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={!holding} onClick={onSell}>
            卖出
          </Button>
          {canAbandon && (
            <Button size="sm" variant="ghost" onClick={onAbandon}>
              关闭
            </Button>
          )}
        </div>
      </Td>
    </Tr>
  )
}
