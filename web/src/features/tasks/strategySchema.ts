import { z } from 'zod'
import type { TaskInput } from '@/api/tasks'
import { bpsToPct, pctToBps, unitsToUsdg, usdgToUnits } from '@/lib/amount'

// 可选金额：'' 视为未设；其余按 USDG 6 位小数校验。返回最小单位串（'' → '0'）或抛 Error('金额格式不正确')。
function optUnits(s: string): string {
  return s.trim() === '' ? '0' : usdgToUnits(s.trim())
}

// '0' → ''（未设）；否则按 USDG 精度回显。
function zeroToEmpty(units: string): string {
  return units === '0' ? '' : unitsToUsdg(units)
}

const MAX_INT64 = 9223372036854775807n

// 百分比字段最多保留 2 位小数（对应后端 1 bps = 0.01% 的精度）。
function hasMoreThanTwoDecimals(p: number): boolean {
  return Math.abs(p * 100 - Math.round(p * 100)) > 1e-9
}

export const strategySchema = z
  .object({
    size_mode: z.enum(['fixed', 'ratio']),
    size_value: z.string(),
    ratio_min: z.string(),
    max_per_trade: z.string(),
    target_min: z.string(),
    target_max: z.string(),
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
    max_chase_pct: z.number({ error: '请输入数字' }).min(0),
    slippage_pct: z.number({ error: '请输入数字' }).gt(0, '滑点须在 0–100 之间').lt(100, '滑点须在 0–100 之间'),
    retry_max: z.number({ error: '请输入数字' }).int('请输入整数').min(0),
  })
  .superRefine((v, ctx) => {
    if (v.size_mode === 'fixed') {
      try {
        if (usdgToUnits(v.size_value) === '0') ctx.addIssue({ code: 'custom', path: ['size_value'], message: '金额必须大于 0' })
      } catch {
        ctx.addIssue({ code: 'custom', path: ['size_value'], message: '金额格式不正确' })
      }
    } else {
      if (!/^\d+(\.\d{1,2})?$/.test(v.size_value)) {
        ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例格式不正确' })
      } else {
        const n = Number(v.size_value)
        if (!Number.isFinite(n) || BigInt(Math.round(n * 100)) > MAX_INT64) {
          ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例过大' })
        } else if (pctToBps(n) < 1) {
          ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例必须大于 0' })
        }
      }

      let maxUnits: bigint | null = null
      try {
        const units = optUnits(v.max_per_trade)
        if (units === '0') {
          ctx.addIssue({ code: 'custom', path: ['max_per_trade'], message: '我方上限必须大于 0' })
        } else {
          maxUnits = BigInt(units)
        }
      } catch {
        ctx.addIssue({ code: 'custom', path: ['max_per_trade'], message: '金额格式不正确' })
      }

      try {
        const ratioMinUnits = optUnits(v.ratio_min)
        if (maxUnits !== null && BigInt(ratioMinUnits) > maxUnits) {
          ctx.addIssue({ code: 'custom', path: ['ratio_min'], message: '我方下限不能大于上限' })
        }
      } catch {
        ctx.addIssue({ code: 'custom', path: ['ratio_min'], message: '金额格式不正确' })
      }
    }

    let targetMinUnits: string | null = null
    let targetMaxUnits: string | null = null
    try {
      targetMinUnits = optUnits(v.target_min)
    } catch {
      ctx.addIssue({ code: 'custom', path: ['target_min'], message: '金额格式不正确' })
    }
    try {
      targetMaxUnits = optUnits(v.target_max)
    } catch {
      ctx.addIssue({ code: 'custom', path: ['target_max'], message: '金额格式不正确' })
    }
    if (
      targetMinUnits !== null &&
      targetMaxUnits !== null &&
      targetMinUnits !== '0' &&
      targetMaxUnits !== '0' &&
      BigInt(targetMaxUnits) < BigInt(targetMinUnits)
    ) {
      ctx.addIssue({ code: 'custom', path: ['target_max'], message: '目标最大买入不能小于最小买入' })
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

    if (v.tp_enabled) {
      if (hasMoreThanTwoDecimals(v.take_profit_pct)) ctx.addIssue({ code: 'custom', path: ['take_profit_pct'], message: '最多 2 位小数' })
      if (hasMoreThanTwoDecimals(v.take_profit_sell_pct)) ctx.addIssue({ code: 'custom', path: ['take_profit_sell_pct'], message: '最多 2 位小数' })
      if (hasMoreThanTwoDecimals(v.stop_loss_pct)) ctx.addIssue({ code: 'custom', path: ['stop_loss_pct'], message: '最多 2 位小数' })
    }
    if (hasMoreThanTwoDecimals(v.max_chase_pct)) ctx.addIssue({ code: 'custom', path: ['max_chase_pct'], message: '最多 2 位小数' })
    if (hasMoreThanTwoDecimals(v.slippage_pct)) ctx.addIssue({ code: 'custom', path: ['slippage_pct'], message: '最多 2 位小数' })
  })

export type StrategyValues = z.infer<typeof strategySchema>

export const RATIO_DEFAULTS = { size_value: '10', ratio_min: '', max_per_trade: '20' } as const
export const FIXED_DEFAULTS = { size_value: '10' } as const

export const defaultStrategy: StrategyValues = {
  size_mode: 'fixed',
  size_value: FIXED_DEFAULTS.size_value,
  ratio_min: RATIO_DEFAULTS.ratio_min,
  max_per_trade: RATIO_DEFAULTS.max_per_trade,
  target_min: '',
  target_max: '',
  max_addon_per_token: 1,
  sell_mode: 'proportional',
  tp_enabled: false,
  take_profit_pct: 0,
  take_profit_sell_pct: 50,
  stop_loss_pct: 0,
  max_hold_min: 0,
  max_chase_pct: 15,
  slippage_pct: 10,
  retry_max: 2,
}

export function toBackend(v: StrategyValues, ids: { wallet_id: number; target_id: number }): TaskInput {
  return {
    ...ids,
    size_mode: v.size_mode,
    size_value: v.size_mode === 'fixed' ? usdgToUnits(v.size_value) : String(pctToBps(Number(v.size_value))),
    ratio_min_usdg: v.size_mode === 'ratio' ? optUnits(v.ratio_min) : '0',
    max_per_trade_usdg: v.size_mode === 'ratio' ? optUnits(v.max_per_trade) : '0',
    min_target_trade_usdg: optUnits(v.target_min),
    max_target_trade_usdg: optUnits(v.target_max),
    max_addon_per_token: v.max_addon_per_token,
    sell_mode: v.sell_mode,
    take_profit_bps: v.tp_enabled ? pctToBps(v.take_profit_pct) : 0,
    take_profit_sell_bps: v.tp_enabled ? pctToBps(v.take_profit_sell_pct) : 0,
    stop_loss_bps: v.tp_enabled ? pctToBps(v.stop_loss_pct) : 0,
    max_hold_sec: v.tp_enabled ? Math.round(v.max_hold_min * 60) : 0,
    max_chase_bps: pctToBps(v.max_chase_pct),
    slippage_bps: pctToBps(v.slippage_pct),
    retry_max: v.retry_max,
  }
}

export function fromBackend(t: TaskInput): StrategyValues {
  const tp = t.take_profit_bps > 0 || t.stop_loss_bps > 0 || t.max_hold_sec > 0
  return {
    size_mode: t.size_mode,
    size_value: t.size_mode === 'fixed' ? unitsToUsdg(t.size_value) : String(bpsToPct(Number(t.size_value))),
    ratio_min: zeroToEmpty(t.ratio_min_usdg),
    // fixed 模式下这个字段不展示、后端值恒为 0：不把 0 带回界面，给一个可用的默认上限，
    // 这样用户切回 ratio 模式不会立刻被"必须大于 0"卡住。
    max_per_trade: t.size_mode === 'ratio' ? unitsToUsdg(t.max_per_trade_usdg) : RATIO_DEFAULTS.max_per_trade,
    target_min: zeroToEmpty(t.min_target_trade_usdg),
    target_max: zeroToEmpty(t.max_target_trade_usdg),
    max_addon_per_token: t.max_addon_per_token,
    sell_mode: t.sell_mode,
    tp_enabled: tp,
    take_profit_pct: bpsToPct(t.take_profit_bps),
    take_profit_sell_pct: t.take_profit_sell_bps > 0 ? bpsToPct(t.take_profit_sell_bps) : 50,
    stop_loss_pct: bpsToPct(t.stop_loss_bps),
    max_hold_min: t.max_hold_sec / 60,
    max_chase_pct: bpsToPct(t.max_chase_bps),
    slippage_pct: bpsToPct(t.slippage_bps),
    retry_max: t.retry_max,
  }
}

export function ratioSummary(t: TaskInput): string {
  const min = t.ratio_min_usdg !== '0' ? unitsToUsdg(t.ratio_min_usdg) : ''
  // 后端 max_per_trade_usdg = 0 表示无上限（迁移前的旧数据不会出现，界面在按比例模式下仍要求填写上限）。
  if (t.max_per_trade_usdg === '0') return min ? `（${min} USDG 起，无上限）` : '（无上限）'
  const max = unitsToUsdg(t.max_per_trade_usdg)
  return min ? `（${min}–${max} USDG）` : `（≤${max} USDG）`
}

export function targetFilterSummary(t: TaskInput): string {
  const min = t.min_target_trade_usdg !== '0' ? unitsToUsdg(t.min_target_trade_usdg) : ''
  const max = t.max_target_trade_usdg !== '0' ? unitsToUsdg(t.max_target_trade_usdg) : ''
  if (min && max) return ` · 目标 ${min}–${max} USDG`
  if (min) return ` · 目标 ≥${min} USDG`
  if (max) return ` · 目标 ≤${max} USDG`
  return ''
}
