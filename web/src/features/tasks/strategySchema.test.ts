import { defaultStrategy, fromBackend, ratioSummary, strategySchema, targetFilterSummary, toBackend } from './strategySchema'

const ids = { wallet_id: 1, target_id: 2 }

it('fixed defaults send no bounds and no target filter', () => {
  expect(strategySchema.safeParse(defaultStrategy).success).toBe(true)
  const b = toBackend(defaultStrategy, ids)
  expect(b).toMatchObject({
    wallet_id: 1, target_id: 2, size_mode: 'fixed', size_value: '10000000',
    max_per_trade_usdg: '0', ratio_min_usdg: '0', min_target_trade_usdg: '0', max_target_trade_usdg: '0',
    spend_limit_usdg: '0', max_addon_per_token: 1, sell_mode: 'proportional', take_profit_bps: 0, take_profit_sell_bps: 0, stop_loss_bps: 0, max_hold_sec: 0,
    follow_curve: true, platforms: ['pons_curve', 'pons_pool', 'uniswap'], quote_assets: ['USDG', 'ETH'],
    max_creator_tax_bps: 200, skip_launch_window_sec: 15, max_chase_bps: 1500, token_blacklist: [], slippage_bps: 1000, retry_max: 2,
  })
})

it('ratio mode sends bps (over 100% allowed) with our bounds; fixed ignores bounds even if present', () => {
  const v = { ...defaultStrategy, size_mode: 'ratio' as const, size_value: '150', ratio_min: '5', max_per_trade: '50' }
  expect(strategySchema.safeParse(v).success).toBe(true)
  expect(toBackend(v, ids)).toMatchObject({ size_value: '15000', ratio_min_usdg: '5000000', max_per_trade_usdg: '50000000' })
  const noMin = toBackend({ ...v, ratio_min: '' }, ids)
  expect(noMin.ratio_min_usdg).toBe('0')
  const fixed = toBackend({ ...defaultStrategy, ratio_min: '5', max_per_trade: '50' }, ids)
  expect(fixed).toMatchObject({ max_per_trade_usdg: '0', ratio_min_usdg: '0' })
})

it('target filter is independent and optional', () => {
  expect(toBackend({ ...defaultStrategy, target_min: '1', target_max: '' }, ids)).toMatchObject({ min_target_trade_usdg: '1000000', max_target_trade_usdg: '0' })
  expect(toBackend({ ...defaultStrategy, target_min: '', target_max: '100' }, ids)).toMatchObject({ min_target_trade_usdg: '0', max_target_trade_usdg: '100000000' })
  expect(strategySchema.safeParse({ ...defaultStrategy, target_min: '100', target_max: '1' }).error?.issues[0].message).toBe('目标最大买入不能小于最小买入')
  expect(strategySchema.safeParse({ ...defaultStrategy, target_min: '1.2.3' }).error?.issues[0].message).toBe('金额格式不正确')
})

it('ratio validation: bounds required/ordered, bps range', () => {
  const r = { ...defaultStrategy, size_mode: 'ratio' as const, size_value: '10', ratio_min: '', max_per_trade: '20' }
  expect(strategySchema.safeParse({ ...r, max_per_trade: '' }).error?.issues[0].message).toBe('我方上限必须大于 0')
  expect(strategySchema.safeParse({ ...r, max_per_trade: '0' }).error?.issues[0].message).toBe('我方上限必须大于 0')
  expect(strategySchema.safeParse({ ...r, ratio_min: '30' }).error?.issues[0].message).toBe('我方下限不能大于上限')
  expect(strategySchema.safeParse({ ...r, size_value: '0.001' }).error?.issues[0].message).toBe('比例必须大于 0')
  expect(strategySchema.safeParse({ ...r, size_value: '0x10' }).error?.issues[0].message).toBe('比例格式不正确')
  expect(strategySchema.safeParse({ ...r, size_value: '1e17' }).error?.issues[0].message).toBe('比例格式不正确')
  expect(strategySchema.safeParse({ ...r, size_value: '99999999999999999999' }).error?.issues[0].message).toBe('比例过大')
  expect(strategySchema.safeParse({ ...r, size_value: '250' }).success).toBe(true)
})

it('fixed validation', () => {
  expect(strategySchema.safeParse({ ...defaultStrategy, size_value: 'abc' }).error?.issues[0].message).toBe('金额格式不正确')
  expect(strategySchema.safeParse({ ...defaultStrategy, size_value: '0' }).error?.issues[0].message).toBe('金额必须大于 0')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 0 }).success).toBe(false)
  expect(strategySchema.safeParse({ ...defaultStrategy, platforms: [] }).success).toBe(false)
  expect(strategySchema.safeParse({ ...defaultStrategy, token_blacklist: 'nope' }).error?.issues[0].message).toBe('黑名单第 1 行不是合法地址')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: NaN }).error?.issues[0].message).toBe('请输入数字')
  expect(strategySchema.safeParse({ ...defaultStrategy, max_addon_per_token: 1.5 }).error?.issues[0].message).toBe('请输入整数')
  expect(strategySchema.safeParse({ ...defaultStrategy, stop_loss_pct: 99.999 }).error?.issues[0].message).toBe('止损比例须小于 100')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 0.001 }).error?.issues[0].message).toBe('滑点须在 0–100 之间')
})

it('round-trips through the backend shape', () => {
  const v = { ...defaultStrategy, size_mode: 'ratio' as const, size_value: '7.5', ratio_min: '2', max_per_trade: '40', target_min: '1', target_max: '',
    tp_enabled: true, take_profit_pct: 25, take_profit_sell_pct: 40, stop_loss_pct: 10, max_hold_min: 1.5, token_blacklist: '0x1111111111111111111111111111111111111111' }
  expect(fromBackend(toBackend(v, ids))).toEqual(v)
  expect(fromBackend(toBackend(defaultStrategy, ids))).toEqual({ ...defaultStrategy, take_profit_sell_pct: 50 })
  // 旧行：fixed 但带非零 max_per_trade（旧封顶值，35 与默认值 20 不同，确保不是巧合读回）→ 回读为 fixed，界面不显示也不带回该值，恒显示默认上限
  const legacy = { ...toBackend(defaultStrategy, ids), max_per_trade_usdg: '35000000' }
  expect(fromBackend(legacy).max_per_trade).toBe('20')
})

it('summaries', () => {
  const b = toBackend({ ...defaultStrategy, size_mode: 'ratio', size_value: '10', ratio_min: '5', max_per_trade: '50' }, ids)
  expect(ratioSummary(b)).toBe('（5–50 USDG）')
  expect(ratioSummary({ ...b, ratio_min_usdg: '0' })).toBe('（≤50 USDG）')
  expect(targetFilterSummary(b)).toBe('')
  expect(targetFilterSummary({ ...b, min_target_trade_usdg: '1000000' })).toBe(' · 目标 ≥1 USDG')
  expect(targetFilterSummary({ ...b, max_target_trade_usdg: '100000000' })).toBe(' · 目标 ≤100 USDG')
  expect(targetFilterSummary({ ...b, min_target_trade_usdg: '1000000', max_target_trade_usdg: '100000000' })).toBe(' · 目标 1–100 USDG')
})

it('parses the blacklist textarea (trim, lowercase, skip blanks)', () => {
  const b = toBackend({ ...defaultStrategy, token_blacklist: ' 0xABC \n\n0xdef\n' }, ids)
  expect(b.token_blacklist).toEqual(['0xabc', '0xdef'])
})
