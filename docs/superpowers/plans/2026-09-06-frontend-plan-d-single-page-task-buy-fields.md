# go-follow-front 计划 D：单页建单、买入字段随模式切换、目标买入过滤 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端对齐后端新买入语义（固定金额无上限；按比例 = 比例 + 我方下限/上限；独立的目标买入过滤），并把三步向导换成单页（基本信息卡片 + 策略表单）。

**Architecture:** `strategySchema` 是唯一的字段/换算定义，先改它；`StrategyForm` 买入区按模式渲染字段并新增“目标买入过滤”组；新组件 `TaskBasicsCard` 承担目标/钱包选择（含新增目标、创建钱包弹窗与自动选中），`TaskFormPage` 取代向导，`TaskEditPage` 复用同一卡片的只读态；列表摘要与文档同步。

**Tech Stack:** 计划 A/B 的栈（React 18、react-hook-form、zod 4、TanStack Query、Radix Dialog、vitest + Testing Library）。

**Spec:** `docs/superpowers/specs/2026-09-06-frontend-design.md` 末尾「修订（2026-09-06，联调后）：§8」；后端契约 go-follow `docs/superpowers/specs/2026-09-06-buy-sizing-target-filter-design.md`（已合并，master `6008624`）。

## Global Constraints

- 后端契约：`TaskInput` 新增 `ratio_min_usdg`、`max_target_trade_usdg`（最小单位十进制串，`"0"` = 未设）；fixed 模式 `max_per_trade_usdg`、`ratio_min_usdg` 提交 `"0"`；ratio 模式 `size_value` 为 bps（≥ 1，无上限，须在 int64 内）、`max_per_trade_usdg > 0`、`ratio_min_usdg ≤ max_per_trade_usdg`；`min_target_trade_usdg`/`max_target_trade_usdg` 都 > 0 时 min ≤ max。
- 界面字段与文案（verbatim）：买入模式 `固定金额`/`按比例`；固定模式只有 `固定金额（USDG）`；按比例模式 `比例（%）`（≥ 0.01，无上限，最多 2 位小数）、`我方下限（USDG，可选）`、`我方上限（USDG，必填）`；组 `目标买入过滤`：`目标最小买入（USDG，可选）`、`目标最大买入（USDG，可选）`；`总额度（USDG，0=不限）`、`单币加仓次数` 不变。空字符串 = 未设（提交 `"0"`）。
- 校验文案：`金额格式不正确`、`金额必须大于 0`、`比例格式不正确`、`比例必须大于 0`、`比例过大`（bps 超过 9,000,000,000,000,000,000 即 int64 时）、`我方上限必须大于 0`、`我方下限不能大于上限`、`目标最大买入不能小于最小买入`。
- 默认值：fixed `size_value '10'`；切到 ratio 时 `size_value '10'`（%）、`ratio_min ''`、`max_per_trade '20'`；目标过滤两项 `''`。
- 单页建单：`/tasks/new` 顶部 `基本信息` 卡片（目标下拉 + `新增目标`；钱包下拉（只列 active）+ `创建钱包`；选中钱包后显示 `余额 x USDG / y ETH`），下方策略表单，按钮 `创建任务`，目标或钱包未选时禁用；新建的目标/钱包自动选中。编辑页同布局，卡片只读。三步向导删除。
- 列表摘要：fixed `固定 10 USDG`；ratio `比例 10%（5–50 USDG）`，无下限时 `比例 10%（≤50 USDG）`；有目标过滤时追加 ` · 目标 ≥1 USDG`/` · 目标 ≤100 USDG`/` · 目标 1–100 USDG`；其后仍是 ` · 按比例卖` 与可选 ` · 止盈止损`。
- 写操作经 `useMutation`；Router 带 v7 `future` 标志；测试输出洁净；`vi.clearAllMocks()`。
- 每个任务结束 `cd web && npm run typecheck && npm test -- --run` 全绿；最后一个任务再 `npm run build`。提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。
- 不做：计划 C 的页面、地址浏览器链接、请求超时。

---

### Task 1: 类型与策略 schema 对齐新语义

**Files:**
- Modify: `web/src/api/tasks.ts`（`TaskInput` 加两字段）、`web/src/features/tasks/strategySchema.ts`
- Test: `web/src/features/tasks/strategySchema.test.ts`（改写相关用例）

**Interfaces:**
- Produces（`StrategyValues` 字段变更，供 Task 2–4 使用）：
```ts
// 买入
size_mode: 'fixed' | 'ratio'; size_value: string          // fixed: USDG；ratio: %
ratio_min: string        // ratio 我方下限 USDG，'' = 无
max_per_trade: string    // ratio 我方上限 USDG（ratio 必填）；fixed 忽略
// 目标买入过滤（原 min_target_trade 改名）
target_min: string; target_max: string                     // '' = 不过滤
// 其余字段不变（spend_limit、max_addon_per_token、sell_mode、tp_*、platforms…）
export const RATIO_DEFAULTS = { size_value: '10', ratio_min: '', max_per_trade: '20' } as const
export const FIXED_DEFAULTS = { size_value: '10' } as const
export function ratioSummary(t: TaskInput): string    // '（5–50 USDG）' / '（≤50 USDG）'
export function targetFilterSummary(t: TaskInput): string  // '' / ' · 目标 ≥1 USDG' / ' · 目标 ≤100 USDG' / ' · 目标 1–100 USDG'
```

- [ ] **Step 1: 改测试**

`strategySchema.test.ts` 整体替换为：
```ts
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
  // 旧行：fixed 但带非零 max_per_trade（旧封顶值）→ 回读为 fixed，界面不显示也不带回该值
  const legacy = { ...toBackend(defaultStrategy, ids), max_per_trade_usdg: '20000000' }
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
```
（既有的 `defaults validate`、`ratio mode…`、`parses the blacklist`、`rejects invalid inputs`、`bps boundary`、`round-trips` 等用例被上面的覆盖并替换；保留 `parses the blacklist textarea` 用例原样。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks/strategySchema.test.ts`
Expected: 字段不存在 / 断言失败。

- [ ] **Step 3: 实现**

`web/src/api/tasks.ts` `TaskInput` 加：
```ts
  ratio_min_usdg: string
  max_target_trade_usdg: string
```

`strategySchema.ts`：
- schema 字段：去掉 `min_target_trade`；加 `ratio_min: z.string()`、`target_min: z.string()`、`target_max: z.string()`；`max_per_trade: z.string()`（不再无条件 `amount` 校验）。
- 通用 helper：
```ts
// 可选金额：'' 视为未设；其余按 USDG 6 位小数校验。返回最小单位串（'' → '0'）或抛 Error('金额格式不正确')。
function optUnits(s: string): string {
  return s.trim() === '' ? '0' : usdgToUnits(s.trim())
}
```
- `superRefine`：
  - fixed：`size_value` 同现状（`金额格式不正确` / `金额必须大于 0`）。
  - ratio：`size_value` 严格十进制（`比例格式不正确`），`bps = pctToBps(Number(size_value))`：`< 1` → `比例必须大于 0`；`> 9_000_000_000_000_000_000`（先用 `BigInt(Math.round(Number(size_value) * 100))` 比较 `> 9223372036854775807n`）→ `比例过大`；`max_per_trade`：`optUnits` 抛错 → `金额格式不正确`，等于 `'0'` → `我方上限必须大于 0`；`ratio_min`：格式错 → `金额格式不正确`，`BigInt(ratio_min_units) > BigInt(max_units)` → `我方下限不能大于上限`。
  - 目标过滤：两项各自 `optUnits`（格式错 → `金额格式不正确`，path 各自）；两项都非 `'0'` 且 `BigInt(max) < BigInt(min)` → `目标最大买入不能小于最小买入`（path `target_max`）。
  - 其余校验（tp、滑点、黑名单…）不变。
- `defaultStrategy`：`size_value '10'`、`ratio_min ''`、`max_per_trade '20'`、`target_min ''`、`target_max ''`（其余不变）；导出 `RATIO_DEFAULTS`、`FIXED_DEFAULTS`。
- `toBackend`：
```ts
    size_value: v.size_mode === 'fixed' ? usdgToUnits(v.size_value) : String(pctToBps(Number(v.size_value))),
    ratio_min_usdg: v.size_mode === 'ratio' ? optUnits(v.ratio_min) : '0',
    max_per_trade_usdg: v.size_mode === 'ratio' ? optUnits(v.max_per_trade) : '0',
    min_target_trade_usdg: optUnits(v.target_min),
    max_target_trade_usdg: optUnits(v.target_max),
```
- `fromBackend`：`ratio_min: t.ratio_min_usdg === '0' ? '' : unitsToUsdg(t.ratio_min_usdg)`；`max_per_trade: unitsToUsdg(t.max_per_trade_usdg)`（`'0'` → `'0'`；ratio 模式下用户必须填，fixed 模式不显示）；`target_min`/`target_max` 同 `ratio_min` 的 `'0' → ''` 规则。注意 `max_per_trade` 回读 `'0'` 时 ratio 校验会报 `我方上限必须大于 0`——这是期望行为（旧 ratio 行缺上限必须补）。
- 摘要函数：
```ts
export function ratioSummary(t: TaskInput): string {
  const max = unitsToUsdg(t.max_per_trade_usdg)
  return t.ratio_min_usdg !== '0' ? `（${unitsToUsdg(t.ratio_min_usdg)}–${max} USDG）` : `（≤${max} USDG）`
}
export function targetFilterSummary(t: TaskInput): string {
  const min = t.min_target_trade_usdg !== '0' ? unitsToUsdg(t.min_target_trade_usdg) : ''
  const max = t.max_target_trade_usdg !== '0' ? unitsToUsdg(t.max_target_trade_usdg) : ''
  if (min && max) return ` · 目标 ${min}–${max} USDG`
  if (min) return ` · 目标 ≥${min} USDG`
  if (max) return ` · 目标 ≤${max} USDG`
  return ''
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run src/features/tasks/strategySchema.test.ts`
Expected: PASS。`typecheck` 会在 `StrategyForm.tsx`/测试里因 `min_target_trade` 改名报错——本任务只需让 schema 测试通过，但提交前 typecheck 必须绿：把 `StrategyForm.tsx` 里 `min_target_trade` 的 `Field`/`register` 临时改为 `target_min`（标签暂保留），Task 2 再整体重做买入区。`TaskWizardPage.test.tsx`/`TasksPage.test.tsx` 若引用 `toBackend(defaultStrategy…)` 的具体值需同步（它们只用返回值做相等比较，不需改）。

- [ ] **Step 5: 提交**

```bash
git add web/src/api/tasks.ts web/src/features/tasks
git commit -m "feat(web): 策略 schema 对齐买入区间与目标买入过滤字段"
```

---

### Task 2: 表单买入区随模式切换，新增目标买入过滤组

**Files:**
- Modify: `web/src/features/tasks/StrategyForm.tsx`
- Test: `web/src/features/tasks/StrategyForm.test.tsx`

**Interfaces:**
- Consumes: Task 1 的字段名与 `RATIO_DEFAULTS`/`FIXED_DEFAULTS`。
- Produces: `StrategyForm` 新增可选 prop `submitDisabled?: boolean`（与 `busy` 一起禁用提交按钮）。

- [ ] **Step 1: 改测试**

`StrategyForm.test.tsx` 中与买入区相关的用例改为：
```tsx
it('fixed mode shows only the amount; ratio mode shows ratio + our bounds; target filter always visible', async () => {
  const onSubmit = vi.fn()
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={onSubmit} />)
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  expect(screen.queryByLabelText('我方上限（USDG，必填）')).not.toBeInTheDocument()
  expect(screen.getByLabelText('目标最小买入（USDG，可选）')).toHaveValue('')
  expect(screen.getByLabelText('目标最大买入（USDG，可选）')).toHaveValue('')

  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenCalledWith(defaultStrategy)

  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('比例（%）')).toHaveValue('10')
  expect(screen.getByLabelText('我方下限（USDG，可选）')).toHaveValue('')
  expect(screen.getByLabelText('我方上限（USDG，必填）')).toHaveValue('20')
  expect(screen.queryByLabelText('固定金额（USDG）')).not.toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('比例（%）'), '0') // 100%
  await userEvent.type(screen.getByLabelText('我方下限（USDG，可选）'), '30')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('我方下限不能大于上限')).toBeInTheDocument()
  expect(onSubmit).toHaveBeenCalledTimes(1)

  await userEvent.clear(screen.getByLabelText('我方下限（USDG，可选）'))
  await userEvent.type(screen.getByLabelText('目标最小买入（USDG，可选）'), '100')
  await userEvent.type(screen.getByLabelText('目标最大买入（USDG，可选）'), '1')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('目标最大买入不能小于最小买入')).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText('目标最大买入（USDG，可选）'))
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenLastCalledWith({ ...defaultStrategy, size_mode: 'ratio', size_value: '100', ratio_min: '', max_per_trade: '20', target_min: '100', target_max: '' })
})

it('switching mode resets the buy fields to that mode defaults and back', async () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} />)
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  await userEvent.clear(screen.getByLabelText('我方上限（USDG，必填）'))
  await userEvent.type(screen.getByLabelText('我方上限（USDG，必填）'), '77')
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'fixed')
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('我方上限（USDG，必填）')).toHaveValue('20')
})

it('submitDisabled disables the submit button', () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} submitDisabled />)
  expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
})
```
保留既有的止盈止损、`step` 属性、卖出说明用例；删掉引用 `单笔上限`/`目标最小交易额` 的旧断言。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks/StrategyForm.test.tsx`

- [ ] **Step 3: 实现**

`StrategyForm.tsx` 买入区：
```tsx
<Field label="买入模式" htmlFor="size_mode">
  <Select id="size_mode" options={SIZE_MODES} {...register('size_mode', { onChange: (e) => {
    if (e.target.value === 'ratio') { setValue('size_value', RATIO_DEFAULTS.size_value); setValue('ratio_min', RATIO_DEFAULTS.ratio_min); setValue('max_per_trade', RATIO_DEFAULTS.max_per_trade) }
    else { setValue('size_value', FIXED_DEFAULTS.size_value) }
  } })} />
</Field>
{sizeMode === 'fixed' ? (
  <Field label="固定金额（USDG）" htmlFor="size_value" hint="目标买多少都不管，每笔买这个金额" error={errors.size_value?.message}>
    <Input id="size_value" {...register('size_value')} />
  </Field>
) : (
  <>
    <Field label="比例（%）" htmlFor="size_value" hint="我方金额 = 目标买入金额 × 比例，可超过 100" error={errors.size_value?.message}>
      <Input id="size_value" {...register('size_value')} />
    </Field>
    <Field label="我方下限（USDG，可选）" htmlFor="ratio_min" hint="算出来低于此值就按此值买" error={errors.ratio_min?.message}>
      <Input id="ratio_min" {...register('ratio_min')} />
    </Field>
    <Field label="我方上限（USDG，必填）" htmlFor="max_per_trade" hint="算出来高于此值就按此值买" error={errors.max_per_trade?.message}>
      <Input id="max_per_trade" {...register('max_per_trade')} />
    </Field>
  </>
)}
```
（所有 `setValue` 用 `{ shouldValidate: false }`。）新增卡片 `目标买入过滤`（放在买入卡片之后、卖出之前）：
```tsx
<Field label="目标最小买入（USDG，可选）" htmlFor="target_min" hint="目标单笔买入低于此值不跟" error={errors.target_min?.message}>
  <Input id="target_min" {...register('target_min')} />
</Field>
<Field label="目标最大买入（USDG，可选）" htmlFor="target_max" hint="目标单笔买入高于此值不跟" error={errors.target_max?.message}>
  <Input id="target_max" {...register('target_max')} />
</Field>
```
提交按钮 `disabled={busy || submitDisabled}`；props 类型加 `submitDisabled?: boolean`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run src/features/tasks`

- [ ] **Step 5: 提交**

```bash
git add web/src/features/tasks
git commit -m "feat(web): 策略表单买入区随模式切换，新增目标买入过滤"
```

---

### Task 3: 单页建单（基本信息卡片）与编辑页复用

**Files:**
- Create: `web/src/features/tasks/TaskBasicsCard.tsx`、`web/src/features/tasks/TaskFormPage.tsx`
- Delete: `web/src/features/tasks/TaskWizardPage.tsx`、`web/src/features/tasks/TaskWizardPage.test.tsx`
- Modify: `web/src/features/tasks/TaskEditPage.tsx`、`web/src/features/wallets/CreateWalletDialog.tsx`（`onCreated(result)`）、`web/src/features/wallets/WalletsPage.tsx`（适配签名）、`web/src/app/App.tsx`
- Test: `web/src/features/tasks/TaskBasicsCard.test.tsx`、`web/src/features/tasks/TaskFormPage.test.tsx`、`web/src/features/tasks/TaskEditPage.test.tsx`（补一条）

**Interfaces:**
- Consumes: `useTargets`、`useWallets`、`TargetDialog`、`CreateWalletDialog`、`StrategyForm`（含 `submitDisabled`）、`tasksApi`、`toBackend`/`fromBackend`。
- Produces:
```tsx
// CreateWalletDialog：onCreated 带上结果，便于调用方自动选中
onCreated(result: { id: number; address: string }): void
// TaskBasicsCard
export function TaskBasicsCard(props: {
  targetId: number | null; walletId: number | null;
  onTargetChange?(id: number): void; onWalletChange?(id: number): void;
  readOnly?: boolean
})
export default function TaskFormPage()   // /tasks/new
```

- [ ] **Step 1: 写失败测试**

`TaskBasicsCard.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn(), create: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { makeQueryClient } from '@/app/queryClient'
import { TaskBasicsCard } from './TaskBasicsCard'

const target = { id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }
const wallet = { id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active' as const, usdg_balance: '5000000', eth_balance: '2000000000000000', task_count: 0, has_pending_withdrawal: false, note: '', created_at: '' }
const disabled = { ...wallet, id: 3, label: '停用', status: 'disabled' as const }

function renderCard(props: Partial<React.ComponentProps<typeof TaskBasicsCard>> = {}) {
  const onTargetChange = vi.fn()
  const onWalletChange = vi.fn()
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <TaskBasicsCard targetId={null} walletId={null} onTargetChange={onTargetChange} onWalletChange={onWalletChange} {...props} />
    </QueryClientProvider>,
  )
  return { onTargetChange, onWalletChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([target])
  vi.mocked(walletsApi.list).mockResolvedValue([wallet, disabled])
})

it('selects target and active wallet, shows balance', async () => {
  const { onTargetChange, onWalletChange } = renderCard()
  await userEvent.selectOptions(await screen.findByLabelText('目标地址'), '2')
  expect(onTargetChange).toHaveBeenCalledWith(2)
  const ws = await screen.findByLabelText('跟单钱包')
  expect(ws).not.toHaveTextContent('停用')
  await userEvent.selectOptions(ws, '1')
  expect(onWalletChange).toHaveBeenCalledWith(1)
})

it('shows the selected wallet balance and read-only labels', async () => {
  renderCard({ targetId: 2, walletId: 1, readOnly: true })
  expect(await screen.findByText(/大户A/)).toBeInTheDocument()
  expect(await screen.findByText(/主钱包/)).toBeInTheDocument()
  expect(screen.getByText('余额 5 USDG / 0.002 ETH')).toBeInTheDocument()
  expect(screen.queryByLabelText('目标地址')).not.toBeInTheDocument()
})

it('creates a target inline and auto-selects it; creates a wallet inline and auto-selects it', async () => {
  vi.mocked(targetsApi.create).mockResolvedValue({ id: 9, address: '0x3333333333333333333333333333333333333333' })
  vi.mocked(walletsApi.create).mockResolvedValue({ id: 7, address: '0x4444444444444444444444444444444444444444' })
  const { onTargetChange, onWalletChange } = renderCard()
  await userEvent.click(await screen.findByRole('button', { name: '新增目标' }))
  await userEvent.type(screen.getByLabelText('地址'), '0x3333333333333333333333333333333333333333')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(onTargetChange).toHaveBeenCalledWith(9)

  await userEvent.click(screen.getByRole('button', { name: '创建钱包' }))
  await userEvent.type(screen.getByLabelText('标签'), 'w')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onWalletChange).toHaveBeenCalledWith(7)
})
```
`TargetDialog` 保存后调用 `onSaved()` 无参——本任务把它改成 `onSaved(result?: { id: number; address: string })`（创建模式传结果，编辑模式不传），`TargetsPage` 忽略参数即可。

`TaskFormPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('@/api/tasks', () => ({ tasksApi: { create: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { tasksApi } from '@/api/tasks'
import { makeQueryClient } from '@/app/queryClient'
import TaskFormPage from './TaskFormPage'
import { defaultStrategy, toBackend } from './strategySchema'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([{ id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active', usdg_balance: '5000000', eth_balance: '0', task_count: 0, has_pending_withdrawal: false, note: '', created_at: '' }])
  vi.mocked(tasksApi.create).mockResolvedValue({ id: 10 })
})

it('renders basics and strategy on one page, disables submit until both selected, then creates', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/tasks/new']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tasks/new" element={<TaskFormPage />} />
          <Route path="/tasks" element={<div>任务列表</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(screen.getByText('基本信息')).toBeInTheDocument()
  expect(screen.getByLabelText('固定金额（USDG）')).toBeInTheDocument()
  const submit = screen.getByRole('button', { name: '创建任务' })
  expect(submit).toBeDisabled()
  await userEvent.selectOptions(await screen.findByLabelText('目标地址'), '2')
  expect(submit).toBeDisabled()
  await userEvent.selectOptions(await screen.findByLabelText('跟单钱包'), '1')
  expect(submit).toBeEnabled()
  await userEvent.click(submit)
  expect(tasksApi.create).toHaveBeenCalledWith(toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }))
  expect(await screen.findByText('任务列表')).toBeInTheDocument()
})
```

`TaskEditPage.test.tsx` 补一条：编辑页显示只读基本信息（`大户A`、`主钱包`、`余额 …`），且不渲染 `目标地址` 下拉；需要在该测试的 mock 里加 `@/api/targets`/`@/api/wallets` 的 `list`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks`

- [ ] **Step 3: 实现**

`CreateWalletDialog.tsx`：`onCreated(result)`，在 `onSuccess: (r) => onCreated(r)`；`WalletsPage.tsx` 调用处改为 `onCreated={() => invalidate()}`（参数忽略）。
`TargetDialog.tsx`：`onSaved(result?: …)`，创建成功时 `onSaved(r)`，编辑时 `onSaved()`。

`TaskBasicsCard.tsx`：
- `useTargets()`、`useWallets()`；`readOnly` 时渲染文本：`目标：大户A 0x2222…2222`、`钱包：主钱包 0x1111…1111`、`余额 x USDG / y ETH`；否则渲染 `<Select id="target">`（标签 `目标地址`，选项同向导）+ `新增目标` 按钮（`TargetDialog`，`onSaved={(r) => { invalidateTargets(); if (r) onTargetChange?.(r.id) }}`）、`<Select id="wallet">`（标签 `跟单钱包`，只列 active）+ `创建钱包` 按钮（`CreateWalletDialog`，`onCreated={(r) => { invalidateWallets(); onWalletChange?.(r.id) }}`），选中钱包时显示余额行（文本 `余额 {unitsToUsdg} USDG / {weiToEth} ETH`）。对话框条件挂载。选项值 `String(id)`，`onChange` → `Number(value)`。
- 加载中显示 `加载中…`。

`TaskFormPage.tsx`：标题 `新建跟单`；`useState` `targetId`/`walletId`；`<TaskBasicsCard …/>`；`<StrategyForm defaultValues={defaultStrategy} submitText="创建任务" submitDisabled={targetId == null || walletId == null} busy={m.isPending} onSubmit={(v) => m.mutate(toBackend(v, { wallet_id: walletId!, target_id: targetId! }))} />`；成功 → `toast.success('任务已创建')`、失效 `['tasks']`、`navigate('/tasks')`。

`TaskEditPage.tsx`：把现有只读标题行换成 `<TaskBasicsCard targetId={task.target_id} walletId={task.wallet_id} readOnly />`；其余不变。

`App.tsx`：`/tasks/new` → `<TaskFormPage />`；删除向导文件与测试。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`
Expected: 全部 PASS（`App.test.tsx` 若引用向导需同步；`WalletsPage.test.tsx` 创建用例不受签名变化影响）。

- [ ] **Step 5: 提交**

```bash
git add -A web/src
git commit -m "feat(web): 新建跟单改单页——基本信息卡片（新增目标/创建钱包自动选中）+ 策略表单，编辑页复用"
```

---

### Task 4: 任务列表摘要、README 与 spec 修订

**Files:**
- Modify: `web/src/features/tasks/TaskRow.tsx`、`web/src/features/tasks/TasksPage.test.tsx`、`README.md`、`docs/superpowers/specs/2026-09-06-frontend-design.md`（实现修订）

- [ ] **Step 1: 改测试**

`TasksPage.test.tsx`：`t1` 保持 fixed → 摘要断言仍为 `固定 10 USDG · 按比例卖`；新增一行任务 `t3 = { ...base, id: 12, size_mode: 'ratio', size_value: '1000', ratio_min_usdg: '5000000', max_per_trade_usdg: '50000000', min_target_trade_usdg: '1000000', max_target_trade_usdg: '0', … }`，断言其摘要 `比例 10%（5–50 USDG） · 目标 ≥1 USDG · 按比例卖`。`base` 来自 `toBackend(defaultStrategy, …)`，已含新字段。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks/TasksPage.test.tsx`

- [ ] **Step 3: 实现**

`TaskRow.tsx` `summaryText`：
```ts
const size = t.size_mode === 'fixed' ? `固定 ${unitsToUsdg(t.size_value)} USDG` : `比例 ${bpsToPct(Number(t.size_value))}%${ratioSummary(t)}`
return `${size}${targetFilterSummary(t)} · ${SELL_MODE_TEXT[t.sell_mode]}${tpOn ? ' · 止盈止损' : ''}`
```

`README.md`（前端仓库）开发/使用说明处加一段「跟单任务」：固定金额 / 按比例（下限可选、上限必填、比例可超 100%）/ 目标买入过滤（各自可选）的一句话说明，以及“对应 go-follow ≥ `6008624`（迁移 4）”。

`docs/superpowers/specs/2026-09-06-frontend-design.md` 末尾加 `## 实现修订（2026-09-06，计划 D）`：`CreateWalletDialog.onCreated` 与 `TargetDialog.onSaved` 改为带结果参数；`StrategyForm` 新增 `submitDisabled`；三步向导删除；旧 ratio 任务缺上限时编辑页会要求补填（`我方上限必须大于 0`）。

- [ ] **Step 4: 全部门禁**

Run: `cd web && npm run typecheck && npm test -- --run && npm run build`

- [ ] **Step 5: 提交**

```bash
git add web/src/features/tasks README.md docs/superpowers/specs/2026-09-06-frontend-design.md
git commit -m "feat(web): 任务摘要显示比例区间与目标过滤，文档与 spec 修订"
```

---

## 自查记录

- **Spec 覆盖**：§8.1（修订）单页与自动选中（T3）；§8.2（修订）字段表、默认值、校验（T1/T2）；摘要格式（T4）；后端契约字段与校验对应（T1）。
- **占位扫描**：无 TBD。
- **类型一致性**：`ratio_min`/`max_per_trade`/`target_min`/`target_max` 在 T1 定义、T2/T3/T4 消费；`RATIO_DEFAULTS`/`FIXED_DEFAULTS` T1 导出、T2 使用；`ratioSummary`/`targetFilterSummary` T1 定义、T4 使用；`submitDisabled` T2 定义、T3 使用；`onCreated(result)`/`onSaved(result?)` T3 定义并同步调用方。
- **已知取舍**：`max_per_trade` 回读 `'0'` 在 ratio 模式下强制补填是有意的；fixed 模式回读时保留旧上限值但不显示、提交时归零。
