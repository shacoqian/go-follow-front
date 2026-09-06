import { isAddress } from 'viem'
import { z } from 'zod'
import type { TaskInput } from '@/api/tasks'
import { bpsToPct, pctToBps, unitsToUsdg, usdgToUnits } from '@/lib/amount'

export const PLATFORMS = [
  { value: 'pons_curve', label: '内盘' },
  { value: 'pons_pool', label: '内盘毕业池' },
  { value: 'uniswap', label: 'Uniswap' },
] as const

export const QUOTE_ASSETS = [
  { value: 'USDG', label: 'USDG' },
  { value: 'ETH', label: 'ETH' },
  { value: 'STOCK', label: '股票代币' },
] as const

const amount = z.string().refine(
  (s) => {
    try {
      usdgToUnits(s)
      return true
    } catch {
      return false
    }
  },
  '金额格式不正确',
)

function parseBlacklist(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.toLowerCase())
}

export const strategySchema = z
  .object({
    size_mode: z.enum(['fixed', 'ratio']),
    size_value: z.string(),
    max_per_trade: amount,
    min_target_trade: amount,
    spend_limit: amount,
    max_addon_per_token: z.number({ error: '请输入数字' }).int('请输入整数').min(1, '至少 1 次'),
    sell_mode: z.enum(['manual', 'proportional', 'all']),
    tp_enabled: z.boolean(),
    take_profit_pct: z.number({ error: '请输入数字' }).min(0),
    take_profit_sell_pct: z
      .number({ error: '请输入数字' })
      .min(0.01, '止盈卖出比例须在 0.01–100')
      .max(100, '止盈卖出比例须在 0.01–100'),
    stop_loss_pct: z.number({ error: '请输入数字' }).min(0).lt(100, '止损比例须小于 100'),
    // 后端存的是秒，90s = 1.5 分钟：这里不能限制成整数分钟，否则编辑一次就把值改了。
    max_hold_min: z.number({ error: '请输入数字' }).min(0),
    platforms: z.array(z.string()).min(1, '至少选一个场所'),
    quote_assets: z.array(z.string()).min(1, '至少选一种计价币'),
    follow_curve: z.boolean(),
    max_creator_tax_pct: z.number({ error: '请输入数字' }).min(0).max(100),
    skip_launch_window_sec: z.number({ error: '请输入数字' }).int('请输入整数').min(0),
    max_chase_pct: z.number({ error: '请输入数字' }).min(0),
    slippage_pct: z.number({ error: '请输入数字' }).gt(0, '滑点须在 0–100 之间').lt(100, '滑点须在 0–100 之间'),
    retry_max: z.number({ error: '请输入数字' }).int('请输入整数').min(0),
    token_blacklist: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.size_mode === 'fixed') {
      try {
        if (usdgToUnits(v.size_value) === '0') ctx.addIssue({ code: 'custom', path: ['size_value'], message: '金额必须大于 0' })
      } catch {
        ctx.addIssue({ code: 'custom', path: ['size_value'], message: '金额格式不正确' })
      }
    } else if (!/^\d+(\.\d+)?$/.test(v.size_value)) {
      ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例格式不正确' })
    } else {
      const bps = pctToBps(Number(v.size_value))
      if (bps < 1) ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例必须大于 0' })
      else if (bps > 10000) ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例不能超过 100' })
    }
    try {
      if (usdgToUnits(v.max_per_trade) === '0') ctx.addIssue({ code: 'custom', path: ['max_per_trade'], message: '单笔上限必须大于 0' })
    } catch {
      /* amount 校验已报 */
    }
    if (pctToBps(v.stop_loss_pct) >= 10000) {
      ctx.addIssue({ code: 'custom', path: ['stop_loss_pct'], message: '止损比例须小于 100' })
    }
    const slippageBps = pctToBps(v.slippage_pct)
    if (slippageBps < 1 || slippageBps > 9999) {
      ctx.addIssue({ code: 'custom', path: ['slippage_pct'], message: '滑点须在 0–100 之间' })
    }
    const tpSellBps = pctToBps(v.take_profit_sell_pct)
    if (tpSellBps < 1 || tpSellBps > 10000) {
      ctx.addIssue({ code: 'custom', path: ['take_profit_sell_pct'], message: '止盈卖出比例须在 0.01–100' })
    }
    parseBlacklist(v.token_blacklist).forEach((a, i) => {
      if (!isAddress(a)) ctx.addIssue({ code: 'custom', path: ['token_blacklist'], message: `黑名单第 ${i + 1} 行不是合法地址` })
    })
  })

export type StrategyValues = z.infer<typeof strategySchema>

export const defaultStrategy: StrategyValues = {
  size_mode: 'fixed',
  size_value: '10',
  max_per_trade: '20',
  min_target_trade: '5',
  spend_limit: '0',
  max_addon_per_token: 1,
  sell_mode: 'proportional',
  tp_enabled: false,
  take_profit_pct: 0,
  take_profit_sell_pct: 50,
  stop_loss_pct: 0,
  max_hold_min: 0,
  platforms: ['pons_curve', 'pons_pool', 'uniswap'],
  quote_assets: ['USDG', 'ETH'],
  follow_curve: true,
  max_creator_tax_pct: 2,
  skip_launch_window_sec: 15,
  max_chase_pct: 15,
  slippage_pct: 10,
  retry_max: 2,
  token_blacklist: '',
}

export function toBackend(v: StrategyValues, ids: { wallet_id: number; target_id: number }): TaskInput {
  return {
    ...ids,
    size_mode: v.size_mode,
    size_value: v.size_mode === 'fixed' ? usdgToUnits(v.size_value) : String(pctToBps(Number(v.size_value))),
    max_per_trade_usdg: usdgToUnits(v.max_per_trade),
    min_target_trade_usdg: usdgToUnits(v.min_target_trade),
    spend_limit_usdg: usdgToUnits(v.spend_limit),
    max_addon_per_token: v.max_addon_per_token,
    sell_mode: v.sell_mode,
    take_profit_bps: v.tp_enabled ? pctToBps(v.take_profit_pct) : 0,
    take_profit_sell_bps: v.tp_enabled ? pctToBps(v.take_profit_sell_pct) : 0,
    stop_loss_bps: v.tp_enabled ? pctToBps(v.stop_loss_pct) : 0,
    max_hold_sec: v.tp_enabled ? Math.round(v.max_hold_min * 60) : 0,
    follow_curve: v.follow_curve,
    platforms: [...v.platforms],
    quote_assets: [...v.quote_assets],
    max_creator_tax_bps: pctToBps(v.max_creator_tax_pct),
    skip_launch_window_sec: v.skip_launch_window_sec,
    max_chase_bps: pctToBps(v.max_chase_pct),
    token_blacklist: parseBlacklist(v.token_blacklist),
    slippage_bps: pctToBps(v.slippage_pct),
    retry_max: v.retry_max,
  }
}

export function fromBackend(t: TaskInput): StrategyValues {
  const tp = t.take_profit_bps > 0 || t.stop_loss_bps > 0 || t.max_hold_sec > 0
  return {
    size_mode: t.size_mode,
    size_value: t.size_mode === 'fixed' ? unitsToUsdg(t.size_value) : String(bpsToPct(Number(t.size_value))),
    max_per_trade: unitsToUsdg(t.max_per_trade_usdg),
    min_target_trade: unitsToUsdg(t.min_target_trade_usdg),
    spend_limit: unitsToUsdg(t.spend_limit_usdg),
    max_addon_per_token: t.max_addon_per_token,
    sell_mode: t.sell_mode,
    tp_enabled: tp,
    take_profit_pct: bpsToPct(t.take_profit_bps),
    take_profit_sell_pct: t.take_profit_sell_bps > 0 ? bpsToPct(t.take_profit_sell_bps) : 50,
    stop_loss_pct: bpsToPct(t.stop_loss_bps),
    max_hold_min: t.max_hold_sec / 60,
    platforms: [...t.platforms],
    quote_assets: [...t.quote_assets],
    follow_curve: t.follow_curve,
    max_creator_tax_pct: bpsToPct(t.max_creator_tax_bps),
    skip_launch_window_sec: t.skip_launch_window_sec,
    max_chase_pct: bpsToPct(t.max_chase_bps),
    slippage_pct: bpsToPct(t.slippage_bps),
    retry_max: t.retry_max,
    token_blacklist: t.token_blacklist.join('\n'),
  }
}
