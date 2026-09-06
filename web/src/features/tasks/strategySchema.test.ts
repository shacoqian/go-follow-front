import { defaultStrategy, fromBackend, strategySchema, toBackend } from './strategySchema'

const ids = { wallet_id: 1, target_id: 2 }

it('defaults validate and convert to the documented backend values', () => {
  expect(strategySchema.safeParse(defaultStrategy).success).toBe(true)
  const b = toBackend(defaultStrategy, ids)
  expect(b).toMatchObject({
    wallet_id: 1, target_id: 2, size_mode: 'fixed', size_value: '10000000', max_per_trade_usdg: '20000000', min_target_trade_usdg: '5000000',
    spend_limit_usdg: '0', max_addon_per_token: 1, sell_mode: 'proportional', take_profit_bps: 0, take_profit_sell_bps: 0, stop_loss_bps: 0, max_hold_sec: 0,
    follow_curve: true, platforms: ['pons_curve', 'pons_pool', 'uniswap'], quote_assets: ['USDG', 'ETH'],
    max_creator_tax_bps: 200, skip_launch_window_sec: 15, max_chase_bps: 1500, token_blacklist: [], slippage_bps: 1000, retry_max: 2,
  })
})

it('ratio mode sends percent as bps; take-profit block sends bps and seconds only when enabled', () => {
  const v = { ...defaultStrategy, size_mode: 'ratio' as const, size_value: '12.5', tp_enabled: true, take_profit_pct: 30, take_profit_sell_pct: 50, stop_loss_pct: 20, max_hold_min: 90 }
  const b = toBackend(v, ids)
  expect(b.size_value).toBe('1250')
  expect(b).toMatchObject({ take_profit_bps: 3000, take_profit_sell_bps: 5000, stop_loss_bps: 2000, max_hold_sec: 5400 })
})

it('parses the blacklist textarea (trim, lowercase, skip blanks)', () => {
  const b = toBackend({ ...defaultStrategy, token_blacklist: ' 0xABC \n\n0xdef\n' }, ids)
  expect(b.token_blacklist).toEqual(['0xabc', '0xdef'])
})

it('rejects invalid inputs with Chinese messages', () => {
  const bad = strategySchema.safeParse({ ...defaultStrategy, size_value: 'abc' })
  expect(bad.success).toBe(false)
  expect(bad.error?.issues[0].message).toBe('金额格式不正确')
  expect(strategySchema.safeParse({ ...defaultStrategy, max_per_trade: '0' }).error?.issues[0].message).toBe('单笔上限必须大于 0')
  expect(strategySchema.safeParse({ ...defaultStrategy, size_mode: 'ratio', size_value: '0' }).error?.issues[0].message).toBe('比例必须大于 0')
  expect(strategySchema.safeParse({ ...defaultStrategy, size_mode: 'ratio', size_value: '150' }).error?.issues[0].message).toBe('比例不能超过 100')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 0 }).success).toBe(false)
  expect(strategySchema.safeParse({ ...defaultStrategy, platforms: [] }).success).toBe(false)
  expect(strategySchema.safeParse({ ...defaultStrategy, token_blacklist: 'nope' }).error?.issues[0].message).toBe('黑名单第 1 行不是合法地址')
})

it('checks percent-to-bps rounding edge cases', () => {
  expect(strategySchema.safeParse({ ...defaultStrategy, stop_loss_pct: 99.999 }).error?.issues[0].message).toBe('止损比例须小于 100')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 0.001 }).error?.issues[0].message).toBe('滑点须在 0–100 之间')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 99.999 }).error?.issues[0].message).toBe('滑点须在 0–100 之间')
  expect(strategySchema.safeParse({ ...defaultStrategy, size_mode: 'ratio' as const, size_value: '0x10' }).error?.issues[0].message).toBe('比例格式不正确')
  expect(strategySchema.safeParse({ ...defaultStrategy, size_mode: 'ratio' as const, size_value: '1e2' }).error?.issues[0].message).toBe('比例格式不正确')
  expect(strategySchema.safeParse({ ...defaultStrategy, size_mode: 'ratio' as const, size_value: '0.001' }).error?.issues[0].message).toBe('比例必须大于 0')
  expect(strategySchema.safeParse({ ...defaultStrategy, stop_loss_pct: 99.99 }).success).toBe(true)
})

it('round-trips through the backend shape', () => {
  const v = { ...defaultStrategy, size_mode: 'ratio' as const, size_value: '7.5', tp_enabled: true, take_profit_pct: 25, take_profit_sell_pct: 40, stop_loss_pct: 10, max_hold_min: 30, token_blacklist: '0x1111111111111111111111111111111111111111' }
  expect(fromBackend(toBackend(v, ids))).toEqual(v)
  expect(fromBackend(toBackend(defaultStrategy, ids))).toEqual({ ...defaultStrategy, take_profit_sell_pct: 50 })
})
