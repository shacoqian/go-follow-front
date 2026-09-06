# go-follow-front 计划 B：钱包池、目标地址、跟单任务 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把计划 A 的三个占位页换成真实功能：钱包池（创建、备注、禁用、导出密文、删除、提现与提现记录）、目标地址（增删改）、跟单任务（三步向导、策略表单、列表与启停/编辑/删除）。

**Architecture:** 每个功能一个目录（`features/wallets`、`features/targets`、`features/tasks`），页面组件只做布局与事件，数据经 `api/<资源>.ts` 的类型化函数与 TanStack Query 的 hooks；金额/百分比换算集中在 `lib/amount.ts`；策略表单用 zod schema 一处定义界面值、校验与到后端单位的换算；需要“刚签过名”的动作复用 `features/auth/auth.ts` 的 `signAction`。UI 原语（Dialog、Input、Select、Checkbox、Table…）按 shadcn 风格手写在 `components/ui/`（Dialog 用 Radix，其余原生元素 + Tailwind）。

**Tech Stack:** 计划 A 的栈 + `react-hook-form` 7.87、`zod` 4.5、`@hookform/resolvers` 5.9、`@radix-ui/react-dialog` 1.1；测试 vitest + Testing Library + `vi.mock` 各 `api/*` 模块。

**Spec:** `docs/superpowers/specs/2026-09-06-frontend-design.md` §6（钱包池）、§7（目标）、§8（任务）、§9 的提现两段、§4/§5 的通用约定。

## Global Constraints

- 后端契约（go-follow `00b657a`，README「接口一览」）：
  - 钱包：`GET /wallets` → 数组 `{id, address, label, note, status, usdg_balance, eth_balance, balance_error?, task_count, has_pending_withdrawal, gas_alert_wei, usdg_alert, created_at}`（余额为最小单位十进制字符串，读失败时为 `null` 且 `balance_error` 非空）；`POST /wallets {label, note}` → `{id, address}`；`PUT /wallets/:id {label, note}`；`POST /wallets/:id/disable`；`GET /wallets/:id/export?action_signature=` → `{address, wallet_key}`（429 `导出过于频繁，请稍后再试`）；`DELETE /wallets/:id?action_signature=&force=0|1` → 200 `{ok}` / 409 `{error, task_ids?|usdg?,eth?}`，error ∈ `钱包仍被任务引用`、`提现进行中`、`余额未知`、`钱包忙，请稍后重试`、`钱包仍有余额`。
  - 提现：`POST /wallets/:id/withdraw {asset:"USDG"|"ETH", amount:"<最小单位>"|"all"}` → 200/202 `{id, tx_hash, status, note?}`；400 `error` 为 `insufficient` / `insufficient gas` 等；409 `提现进行中` / `钱包忙，请稍后重试`；`GET /wallets/:id/withdrawals` → 数组；`GET /withdrawals/:id` → `{id, wallet_id, asset, amount, to_addr, status, error, tx_hash, created_at, updated_at}`，status ∈ PENDING|SENT|CONFIRMED|FAILED。
  - 目标：`GET /targets` → `{id, owner, address, label, note, created_at}[]`；`POST /targets {address, label, note}` → `{id, address}`（重复 409 `目标地址已存在`）；`PUT /targets/:id {label, note}`；`DELETE /targets/:id`（被引用 409）。
  - 任务：`GET /tasks` → 数组（字段见 §8.3 与 `TaskInput`）；`POST /tasks` / `PUT /tasks/:id` 收完整 `TaskInput`（`wallet_id`、`target_id` 必带；`size_value`/`max_per_trade_usdg`/`min_target_trade_usdg`/`spend_limit_usdg` 为最小单位或 bps 的十进制字符串；`max_per_trade_usdg` 必须 > 0；`slippage_bps` ∈ (0,10000)；`platforms`/`quote_assets` 非空；`take_profit_sell_bps` 0 时后端默认 5000；`max_addon_per_token` ≤ 0 时后端默认 1）；`POST /tasks/:id/enable|disable`；`DELETE /tasks/:id` → 200 `{ok, warning?}` / 409 `任务仍有持仓，请先卖出`。
- 动作签名每次重新请求（`signAction`），签名后即用；后端 409 也会消耗挑战。
- 金额显示：USDG 6 位小数、ETH 18 位（显示保留 6 位），去掉尾随零；输入按小数字符串校验（最多 6 位小数），提交时换成最小单位字符串；百分比 ↔ bps 用 `pctToBps`/`bpsToPct`。
- 所有 UI 文案中文；后端 `error` 文案原样展示（React 文本节点，不用 `dangerouslySetInnerHTML`）；不在日志/console 打印密文、签名、token。
- 写操作成功后使相关 query 失效；列表轮询 10 秒；单笔提现状态 3 秒直到终态。
- 浏览器链接：`lib/explorer.ts` 读 `import.meta.env.VITE_EXPLORER_BASE`（如 `https://explorer.example/tx/`），为空时只显示哈希与复制按钮。
- 每个任务结束：`cd web && npm run typecheck && npm test -- --run` 全绿且输出洁净（Router 带 v7 `future` 标志；用 `vi.clearAllMocks()` 或逐文件 reset 保证调用计数可靠）；最后一个任务再加 `npm run build`。提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。
- 不做：仓位/决策/信号页、管理员页、冒烟脚本（计划 C）；shadcn CLI；暗色/移动端。

---

### Task 1: API 层扩展（带状态码的请求、钱包/目标/任务/提现接口）与金额工具

**Files:**
- Modify: `web/src/api/client.ts`（新增 `requestFull`，`request` 改为其包装）
- Create: `web/src/api/wallets.ts`、`web/src/api/targets.ts`、`web/src/api/tasks.ts`、`web/src/lib/amount.ts`、`web/src/lib/explorer.ts`
- Test: `web/src/api/client.test.ts`（追加）、`web/src/api/resources.test.ts`、`web/src/lib/amount.test.ts`

**Interfaces:**
- Produces:
```ts
// client.ts
export interface Reply<T> { status: number; data: T }
export function requestFull<T>(method: Method, path: string, body?: unknown): Promise<Reply<T>>
// wallets.ts
export interface Wallet { id: number; address: string; label: string; note: string; status: 'active' | 'disabled'; usdg_balance: string | null; eth_balance: string | null; balance_error?: string; task_count: number; has_pending_withdrawal: boolean; created_at: string }
export interface Withdrawal { id: number; wallet_id: number; asset: 'USDG' | 'ETH'; amount: string; to_addr: string; status: 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED'; error: string; tx_hash: string; created_at: string; updated_at: string }
export interface WithdrawResult { id: number; tx_hash: string; status: string; note?: string }
export const walletsApi: {
  list(): Promise<Wallet[]>; create(body: { label: string; note: string }): Promise<{ id: number; address: string }>;
  update(id: number, body: { label: string; note: string }): Promise<void>; disable(id: number): Promise<void>;
  exportKey(id: number, signature: string): Promise<{ address: string; wallet_key: string }>;
  remove(id: number, signature: string, force: boolean): Promise<void>;
  withdraw(id: number, body: { asset: 'USDG' | 'ETH'; amount: string }): Promise<Reply<WithdrawResult>>;
  withdrawals(id: number): Promise<Withdrawal[]>;
}
export const withdrawalsApi: { get(id: number): Promise<Withdrawal> }
// targets.ts
export interface Target { id: number; address: string; label: string; note: string; created_at: string }
export const targetsApi: { list(): Promise<Target[]>; create(body: { address: string; label: string; note: string }): Promise<{ id: number; address: string }>; update(id: number, body: { label: string; note: string }): Promise<void>; remove(id: number): Promise<void> }
// tasks.ts
export interface TaskInput { wallet_id: number; target_id: number; size_mode: 'fixed' | 'ratio'; size_value: string; max_per_trade_usdg: string; min_target_trade_usdg: string; spend_limit_usdg: string; max_addon_per_token: number; sell_mode: 'manual' | 'proportional' | 'all'; take_profit_bps: number; take_profit_sell_bps: number; stop_loss_bps: number; max_hold_sec: number; follow_curve: boolean; platforms: string[]; quote_assets: string[]; max_creator_tax_bps: number; skip_launch_window_sec: number; max_chase_bps: number; token_blacklist: string[]; slippage_bps: number; retry_max: number }
export interface Task extends TaskInput { id: number; owner: string; enabled: boolean; spent_usdg: string; consecutive_failures: number; paused_reason: string; paused_at: string | null }
export const tasksApi: { list(): Promise<Task[]>; create(body: TaskInput): Promise<{ id: number }>; update(id: number, body: TaskInput): Promise<void>; enable(id: number): Promise<void>; disable(id: number): Promise<void>; remove(id: number): Promise<{ ok: boolean; warning?: string }> }
// amount.ts
export const USDG_DECIMALS = 6; export const ETH_DECIMALS = 18
export function toUnits(amount: string, decimals: number): string      // '12.5',6 → '12500000'；非法/小数位超限抛 Error('金额格式不正确')；'' 视为 '0'
export function fromUnits(units: string | null | undefined, decimals: number, maxFrac?: number): string // '12500000',6 → '12.5'；null → '0'
export const usdgToUnits: (s: string) => string; export const unitsToUsdg: (u: string | null | undefined) => string
export const ethToWei: (s: string) => string;   export const weiToEth: (w: string | null | undefined) => string   // 显示保留 6 位
export function pctToBps(p: number): number; export function bpsToPct(b: number): number
// explorer.ts
export function txUrl(hash: string): string | null
```

- [ ] **Step 1: 写失败测试**

追加到 `web/src/api/client.test.ts` 的 `describe('request')` 里（复用已有 `fetchMock`/`jsonResponse`）：
```ts
  it('requestFull keeps the status code (202 stays distinguishable)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { id: 1, note: '已广播，状态待确认' }))
    const r = await requestFull<{ id: number }>('POST', '/wallets/1/withdraw', { asset: 'ETH', amount: '1' })
    expect(r.status).toBe(202)
    expect(r.data.id).toBe(1)
  })
```
并把 import 改成 `import { ApiError, configureClient, messageFor, request, requestFull } from './client'`。

`web/src/api/resources.test.ts`：
```ts
import * as client from './client'
import { walletsApi, withdrawalsApi } from './wallets'
import { targetsApi } from './targets'
import { tasksApi } from './tasks'

const req = vi.spyOn(client, 'request')
const reqFull = vi.spyOn(client, 'requestFull')
beforeEach(() => {
  req.mockReset().mockResolvedValue({})
  reqFull.mockReset().mockResolvedValue({ status: 200, data: {} })
})

it('wallets routes', async () => {
  await walletsApi.list()
  await walletsApi.create({ label: 'a', note: 'b' })
  await walletsApi.update(3, { label: 'a', note: 'b' })
  await walletsApi.disable(3)
  await walletsApi.exportKey(3, '0xsig')
  await walletsApi.remove(3, '0xsig', false)
  await walletsApi.remove(3, '0xsig', true)
  await walletsApi.withdrawals(3)
  await withdrawalsApi.get(9)
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/wallets', undefined],
    ['POST', '/wallets', { label: 'a', note: 'b' }],
    ['PUT', '/wallets/3', { label: 'a', note: 'b' }],
    ['POST', '/wallets/3/disable', undefined],
    ['GET', '/wallets/3/export?action_signature=0xsig', undefined],
    ['DELETE', '/wallets/3?action_signature=0xsig&force=0', undefined],
    ['DELETE', '/wallets/3?action_signature=0xsig&force=1', undefined],
    ['GET', '/wallets/3/withdrawals', undefined],
    ['GET', '/withdrawals/9', undefined],
  ])
})

it('withdraw uses requestFull so 202 survives', async () => {
  reqFull.mockResolvedValue({ status: 202, data: { id: 1, tx_hash: '0x', status: 'SENT', note: 'n' } })
  const r = await walletsApi.withdraw(3, { asset: 'USDG', amount: 'all' })
  expect(reqFull).toHaveBeenCalledWith('POST', '/wallets/3/withdraw', { asset: 'USDG', amount: 'all' })
  expect(r.status).toBe(202)
})

it('targets and tasks routes', async () => {
  await targetsApi.list()
  await targetsApi.create({ address: '0xabc', label: 'l', note: 'n' })
  await targetsApi.update(2, { label: 'l', note: 'n' })
  await targetsApi.remove(2)
  await tasksApi.list()
  await tasksApi.enable(5)
  await tasksApi.disable(5)
  await tasksApi.remove(5)
  expect(req.mock.calls.map((c) => c.slice(0, 2))).toEqual([
    ['GET', '/targets'], ['POST', '/targets'], ['PUT', '/targets/2'], ['DELETE', '/targets/2'],
    ['GET', '/tasks'], ['POST', '/tasks/5/enable'], ['POST', '/tasks/5/disable'], ['DELETE', '/tasks/5'],
  ])
})
```

`web/src/lib/amount.test.ts`：
```ts
import { bpsToPct, ethToWei, fromUnits, pctToBps, toUnits, unitsToUsdg, usdgToUnits, weiToEth } from './amount'

describe('toUnits', () => {
  it.each([
    ['12.5', 6, '12500000'],
    ['0.000001', 6, '1'],
    ['100', 6, '100000000'],
    ['0', 6, '0'],
    ['', 6, '0'],
    ['1.5', 18, '1500000000000000000'],
  ])('%s with %i decimals → %s', (s, d, want) => expect(toUnits(s, d)).toBe(want))
  it.each(['abc', '1.2.3', '-1', '0.0000001', ' 1'])('rejects %s', (s) => expect(() => toUnits(s, 6)).toThrow('金额格式不正确'))
})

describe('fromUnits', () => {
  it.each([
    ['12500000', 6, undefined, '12.5'],
    ['1', 6, undefined, '0.000001'],
    ['100000000', 6, undefined, '100'],
    ['0', 6, undefined, '0'],
    [null, 6, undefined, '0'],
    ['1234567890123456789', 18, 6, '1.234567'],
  ])('%s → %s', (u, d, f, want) => expect(fromUnits(u as string | null, d, f)).toBe(want))
})

it('usdg / eth helpers and bps', () => {
  expect(usdgToUnits('3')).toBe('3000000')
  expect(unitsToUsdg('3000000')).toBe('3')
  expect(ethToWei('0.0001')).toBe('100000000000000')
  expect(weiToEth('100000000000000')).toBe('0.0001')
  expect(pctToBps(12.5)).toBe(1250)
  expect(pctToBps(0.01)).toBe(1)
  expect(bpsToPct(1250)).toBe(12.5)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/api src/lib`
Expected: `requestFull` 不存在、模块不存在。

- [ ] **Step 3: 实现**

`web/src/api/client.ts`：把 `request` 拆成
```ts
export interface Reply<T> {
  status: number
  data: T
}

// requestFull 保留状态码：提现接口用 200/202 区分"已确认写库"与"已广播待确认"，只看 body 分不出来。
export async function requestFull<T>(method: Method, path: string, body?: unknown): Promise<Reply<T>> {
  // …原 request 的实现，成功时 return { status: res.status, data: data as T }
}

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return (await requestFull<T>(method, path, body)).data
}
```
（错误路径不变：仍抛 `ApiError`。）

`web/src/api/wallets.ts`：
```ts
import { request, requestFull, type Reply } from './client'

export interface Wallet { /* 如 Interfaces */ }
export interface Withdrawal { /* 如 Interfaces */ }
export interface WithdrawResult { id: number; tx_hash: string; status: string; note?: string }

export const walletsApi = {
  list: () => request<Wallet[]>('GET', '/wallets'),
  create: (body: { label: string; note: string }) => request<{ id: number; address: string }>('POST', '/wallets', body),
  update: (id: number, body: { label: string; note: string }) => request<void>('PUT', `/wallets/${id}`, body),
  disable: (id: number) => request<void>('POST', `/wallets/${id}/disable`),
  exportKey: (id: number, signature: string) =>
    request<{ address: string; wallet_key: string }>('GET', `/wallets/${id}/export?action_signature=${encodeURIComponent(signature)}`),
  remove: (id: number, signature: string, force: boolean) =>
    request<void>('DELETE', `/wallets/${id}?action_signature=${encodeURIComponent(signature)}&force=${force ? 1 : 0}`),
  withdraw: (id: number, body: { asset: 'USDG' | 'ETH'; amount: string }): Promise<Reply<WithdrawResult>> =>
    requestFull<WithdrawResult>('POST', `/wallets/${id}/withdraw`, body),
  withdrawals: (id: number) => request<Withdrawal[]>('GET', `/wallets/${id}/withdrawals`),
}

export const withdrawalsApi = {
  get: (id: number) => request<Withdrawal>('GET', `/withdrawals/${id}`),
}
```
（签名是 `0x` 开头的 hex，`encodeURIComponent` 不会改变它，测试断言的是原样字符串。）

`web/src/api/targets.ts`、`web/src/api/tasks.ts` 按 Interfaces 写，`tasksApi.create` 是 `request<{ id: number }>('POST', '/tasks', body)`，`update` 是 `request<void>('PUT', `/tasks/${id}`, body)`，`remove` 是 `request<{ ok: boolean; warning?: string }>('DELETE', `/tasks/${id}`)`。

`web/src/lib/amount.ts`：
```ts
export const USDG_DECIMALS = 6
export const ETH_DECIMALS = 18

const DEC_RE = /^(\d+)(?:\.(\d+))?$/

// 十进制小数字符串 → 最小单位整数字符串。用 BigInt 避免浮点误差；小数位超过 decimals 直接拒绝而不是四舍五入——钱的事不猜。
export function toUnits(amount: string, decimals: number): string {
  if (amount === '') return '0'
  const m = DEC_RE.exec(amount)
  if (!m) throw new Error('金额格式不正确')
  const [, whole, frac = ''] = m
  if (frac.length > decimals) throw new Error('金额格式不正确')
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')).toString()
}

export function fromUnits(units: string | null | undefined, decimals: number, maxFrac = decimals): string {
  if (!units) return '0'
  const neg = units.startsWith('-')
  const abs = neg ? units.slice(1) : units
  const padded = abs.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  let frac = padded.slice(padded.length - decimals).slice(0, maxFrac).replace(/0+$/, '')
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '')
}

export const usdgToUnits = (s: string) => toUnits(s, USDG_DECIMALS)
export const unitsToUsdg = (u: string | null | undefined) => fromUnits(u, USDG_DECIMALS)
export const ethToWei = (s: string) => toUnits(s, ETH_DECIMALS)
export const weiToEth = (w: string | null | undefined) => fromUnits(w, ETH_DECIMALS, 6)

export function pctToBps(p: number): number {
  return Math.round(p * 100)
}
export function bpsToPct(b: number): number {
  return b / 100
}
```
`tsconfig.json` 的 `target` 是 ES2020，BigInt 字面量 `10n` 可用。

`web/src/lib/explorer.ts`：
```ts
// 区块浏览器交易页前缀（如 https://explorer.example/tx/）；未配置时返回 null，界面只显示哈希与复制按钮。
export function txUrl(hash: string): string | null {
  const base = import.meta.env.VITE_EXPLORER_BASE as string | undefined
  if (!base) return null
  return base.endsWith('/') ? base + hash : `${base}/${hash}`
}
```
`web/src/vite-env.d.ts` 加：
```ts
interface ImportMetaEnv {
  readonly VITE_EXPLORER_BASE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```
`.env.example` 加一行 `VITE_EXPLORER_BASE=`（构建期变量，放 `web/.env.example` 更合适：新建 `web/.env.example` 内容 `VITE_EXPLORER_BASE=` 并在 README 开发章节提一句）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`
Expected: 全部 PASS（新增 api/resources 3 个、amount 一组、client 1 个）。

- [ ] **Step 5: 提交**

```bash
git add web/src/api web/src/lib web/src/vite-env.d.ts web/.env.example README.md
git commit -m "feat(web): 钱包/目标/任务/提现 API 与金额换算工具"
```

---

### Task 2: UI 原语（Dialog、Input、Label、Textarea、Select、Checkbox、Table、Badge、Field）与复制按钮

**Files:**
- Modify: `web/package.json`（加依赖）
- Create: `web/src/components/ui/dialog.tsx`、`input.tsx`、`label.tsx`、`textarea.tsx`、`select.tsx`、`checkbox.tsx`、`table.tsx`、`badge.tsx`、`field.tsx`、`web/src/components/CopyButton.tsx`、`web/src/components/ConfirmDialog.tsx`
- Test: `web/src/components/ui/dialog.test.tsx`、`web/src/components/CopyButton.test.tsx`、`web/src/components/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces（全部 `export`，样式类名可按 shadcn 习惯，接口固定）：
```tsx
// dialog.tsx（Radix）
export function Dialog(props: { open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode })
// input.tsx / textarea.tsx：forwardRef 的 <input>/<textarea>，接受原生 props
export const Input; export const Textarea
// label.tsx
export const Label  // <label className="text-sm font-medium">
// select.tsx：原生 <select>，接受 options
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] })
// checkbox.tsx：原生 checkbox + 文本
export const Checkbox: React.ForwardRefExoticComponent<React.InputHTMLAttributes<HTMLInputElement> & { label: string }>
// table.tsx
export function Table(props: { head: React.ReactNode[]; children: React.ReactNode; empty?: string })  // 无行时显示 empty
export function Tr / Td / Th
// badge.tsx
export function Badge(props: { tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue'; children: React.ReactNode })
// field.tsx
export function Field(props: { label: string; error?: string; hint?: string; children: React.ReactNode })
// CopyButton.tsx
export function CopyButton(props: { text: string; label?: string })   // 点击 navigator.clipboard.writeText，1.5 秒内显示"已复制"
// ConfirmDialog.tsx
export function ConfirmDialog(props: { open: boolean; onOpenChange(o: boolean): void; title: string; description: string; confirmText?: string; destructive?: boolean; busy?: boolean; onConfirm(): void })
```

- [ ] **Step 1: 加依赖**

`web/package.json` `dependencies` 加：
```json
"@hookform/resolvers": "^5.9.0",
"@radix-ui/react-dialog": "^1.1.23",
"react-hook-form": "^7.87.0",
"zod": "^4.5.0"
```
Run: `cd web && npm install`（更新 lockfile）。

- [ ] **Step 2: 写失败测试**

`web/src/components/ui/dialog.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './dialog'

it('renders title/description/children when open and calls onOpenChange on close', async () => {
  const onOpenChange = vi.fn()
  render(
    <Dialog open title="标题" description="说明" onOpenChange={onOpenChange} footer={<button>确定</button>}>
      <p>内容</p>
    </Dialog>,
  )
  expect(screen.getByRole('dialog', { name: '标题' })).toBeInTheDocument()
  expect(screen.getByText('说明')).toBeInTheDocument()
  expect(screen.getByText('内容')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('renders nothing when closed', () => {
  render(<Dialog open={false} title="标题" onOpenChange={() => {}}><p>内容</p></Dialog>)
  expect(screen.queryByText('内容')).not.toBeInTheDocument()
})
```

`web/src/components/CopyButton.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton } from './CopyButton'

it('copies text and shows feedback', async () => {
  const writeText = vi.fn(async () => {})
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CopyButton text="0xabc" />)
  await userEvent.click(screen.getByRole('button', { name: '复制' }))
  expect(writeText).toHaveBeenCalledWith('0xabc')
  expect(await screen.findByText('已复制')).toBeInTheDocument()
})
```

`web/src/components/ConfirmDialog.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

it('confirms and cancels', async () => {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(<ConfirmDialog open title="禁用钱包" description="禁用后不再跟单" confirmText="禁用" destructive onConfirm={onConfirm} onOpenChange={onOpenChange} />)
  await userEvent.click(screen.getByRole('button', { name: '禁用' }))
  expect(onConfirm).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd web && npm test -- --run src/components`
Expected: 模块不存在。

- [ ] **Step 4: 实现**

`web/src/components/ui/dialog.tsx`：
```tsx
import * as RD from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from './button'

export function Dialog({ open, onOpenChange, title, description, children, footer }: {
  open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: ReactNode; footer?: ReactNode
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RD.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg focus:outline-none">
          <RD.Title className="text-lg font-semibold">{title}</RD.Title>
          {description ? <RD.Description className="mt-1 text-sm text-slate-600">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
          <div className="mt-4 space-y-3">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <RD.Close asChild>
              <Button variant="outline">关闭</Button>
            </RD.Close>
            {footer}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
```
（Radix 要求有 `Description`，否则控制台告警；没传就渲染一个 `sr-only` 的占位，保证测试输出洁净。）

`input.tsx`、`textarea.tsx`、`label.tsx`：forwardRef 包一层 Tailwind 类（`h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400`）。

`select.tsx`：
```tsx
import * as React from 'react'
import { cn } from '@/lib/cn'
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }>(
  ({ options, className, ...props }, ref) => (
    <select ref={ref} className={cn('h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm', className)} {...props}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
)
Select.displayName = 'Select'
```

`checkbox.tsx`：`<label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" ref={ref} {...props} />{label}</label>`。

`table.tsx`：
```tsx
export function Table({ head, children, empty = '暂无数据' }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  const rows = React.Children.toArray(children)
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{rows.length ? rows : <tr><td colSpan={head.length} className="px-3 py-6 text-center text-slate-400">{empty}</td></tr>}</tbody>
      </table>
    </div>
  )
}
export const Tr = (p: React.HTMLAttributes<HTMLTableRowElement>) => <tr className="border-t border-slate-100" {...p} />
export const Td = (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="px-3 py-2 align-middle" {...p} />
```

`badge.tsx`：按 tone 映射颜色类（gray `bg-slate-100 text-slate-700`、green、red、amber、blue）。

`field.tsx`：
```tsx
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}
```

`CopyButton.tsx`：
```tsx
export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text) } catch { toast.error('复制失败，请手动选择文本'); return }
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return <Button type="button" variant="ghost" size="sm" onClick={copy}>{done ? '已复制' : label}</Button>
}
```

`ConfirmDialog.tsx`：用 `Dialog`，`footer` 是 `<Button variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>{confirmText ?? '确定'}</Button>`，正文放 `description`（作为 children 的文本，同时给 `Dialog.description` 传同一句），另放一个 `取消` 按钮调用 `onOpenChange(false)`（`Dialog` 自带的"关闭"按钮保留即可，但测试点的是"取消"——在 `footer` 前面渲染 `<Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>`，并把 `Dialog` 改成接受 `hideClose?: boolean`，ConfirmDialog 传 `hideClose` 以免出现两个关闭按钮）。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`
Expected: 全部 PASS，无 Radix 告警。

- [ ] **Step 6: 提交**

```bash
git add web/package.json web/package-lock.json web/src/components
git commit -m "feat(web): UI 原语（Dialog/Input/Select/Table 等）、复制按钮、确认对话框"
```

---

### Task 3: 钱包页——列表、创建、编辑备注、禁用

**Files:**
- Create: `web/src/features/wallets/useWallets.ts`、`web/src/features/wallets/WalletsPage.tsx`、`web/src/features/wallets/CreateWalletDialog.tsx`、`web/src/features/wallets/EditWalletDialog.tsx`、`web/src/features/wallets/WalletRow.tsx`
- Modify: `web/src/app/App.tsx`（`/wallets` 用 `WalletsPage`）
- Test: `web/src/features/wallets/WalletsPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 `walletsApi`、`unitsToUsdg`、`weiToEth`；Task 2 UI 原语、`CopyButton`、`ConfirmDialog`；`toast`、`shortAddress`、`queryClient`。
- Produces:
```ts
// useWallets.ts
export const walletKeys = { list: ['wallets'] as const }
export function useWallets(): UseQueryResult<Wallet[]>                 // refetchInterval 10_000
export function useInvalidateWallets(): () => Promise<void>
// WalletRow.tsx：一行 + 操作按钮；通过 props 回调打开各对话框
export function WalletRow(props: { wallet: Wallet; onEdit(): void; onDisable(): void; onExport(): void; onDelete(): void; onWithdraw(): void; onHistory(): void })
```
Task 4/5 只往 `WalletsPage` 里接对话框，不改 `WalletRow` 的接口。

- [ ] **Step 1: 写失败测试**

`web/src/features/wallets/WalletsPage.test.tsx`：
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/wallets', () => ({
  walletsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), disable: vi.fn(), exportKey: vi.fn(), remove: vi.fn(), withdraw: vi.fn(), withdrawals: vi.fn() },
  withdrawalsApi: { get: vi.fn() },
}))
vi.mock('@/features/auth/auth', () => ({ signAction: vi.fn() }))

import { walletsApi, type Wallet } from '@/api/wallets'
import { useSession } from '@/features/auth/session'
import { makeQueryClient } from '@/app/queryClient'
import WalletsPage from './WalletsPage'

const w1: Wallet = { id: 1, address: '0x8ba1f109551bd432803012645ac136ddd64dba72', label: '主钱包', note: '', status: 'active',
  usdg_balance: '12500000', eth_balance: '100000000000000', task_count: 2, has_pending_withdrawal: true, created_at: '2026-09-06T00:00:00Z' }
const w2: Wallet = { ...w1, id: 2, label: '备用', status: 'disabled', usdg_balance: null, eth_balance: null, balance_error: '余额读取失败', task_count: 0, has_pending_withdrawal: false }

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WalletsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  vi.mocked(walletsApi.list).mockResolvedValue([w1, w2])
})

it('lists wallets with formatted balances, counts and badges', async () => {
  renderPage()
  const row = (await screen.findByText('主钱包')).closest('tr')!
  expect(within(row).getByText('0x8ba1…ba72')).toBeInTheDocument()
  expect(within(row).getByText('12.5')).toBeInTheDocument()
  expect(within(row).getByText('0.0001')).toBeInTheDocument()
  expect(within(row).getByText('2')).toBeInTheDocument()
  expect(within(row).getByText('提现中')).toBeInTheDocument()
  const row2 = screen.getByText('备用').closest('tr')!
  expect(within(row2).getAllByText('读取失败')).toHaveLength(2)
  expect(within(row2).getByText('已禁用')).toBeInTheDocument()
})

it('creates a wallet and shows the new address with the funding hint', async () => {
  vi.mocked(walletsApi.create).mockResolvedValue({ id: 3, address: '0x1111111111111111111111111111111111111111' })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '创建钱包' }))
  await userEvent.type(screen.getByLabelText('标签'), '新钱包')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(walletsApi.create).toHaveBeenCalledWith({ label: '新钱包', note: '' })
  expect(await screen.findByText('0x1111111111111111111111111111111111111111')).toBeInTheDocument()
  expect(screen.getByText(/转入 USDG/)).toBeInTheDocument()
  expect(walletsApi.list).toHaveBeenCalledTimes(2)
})

it('edits label/note and disables with confirmation', async () => {
  vi.mocked(walletsApi.update).mockResolvedValue(undefined)
  vi.mocked(walletsApi.disable).mockResolvedValue(undefined)
  renderPage()
  const row = (await screen.findByText('主钱包')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }))
  const label = screen.getByLabelText('标签')
  await userEvent.clear(label)
  await userEvent.type(label, '改名')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(walletsApi.update).toHaveBeenCalledWith(1, { label: '改名', note: '' })

  await userEvent.click(within(row).getByRole('button', { name: '禁用' }))
  await userEvent.click(screen.getByRole('button', { name: '确认禁用' }))
  expect(walletsApi.disable).toHaveBeenCalledWith(1)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/wallets`
Expected: 模块不存在。

- [ ] **Step 3: 实现**

`useWallets.ts`：
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { walletsApi } from '@/api/wallets'

export const walletKeys = { list: ['wallets'] as const }

export function useWallets() {
  return useQuery({ queryKey: walletKeys.list, queryFn: walletsApi.list, refetchInterval: 10_000 })
}

export function useInvalidateWallets() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: walletKeys.list })
}
```

`WalletRow.tsx`：
```tsx
export function WalletRow({ wallet: w, onEdit, onDisable, onExport, onDelete, onWithdraw, onHistory }: Props) {
  const bal = (v: string | null, f: (x: string | null) => string) => (w.balance_error ? '读取失败' : f(v))
  return (
    <Tr>
      <Td><div className="font-medium">{w.label || '（未命名）'}</div>{w.note && <div className="text-xs text-slate-500">{w.note}</div>}</Td>
      <Td><span className="font-mono">{shortAddress(w.address)}</span> <CopyButton text={w.address} /></Td>
      <Td>{bal(w.usdg_balance, unitsToUsdg)}</Td>
      <Td>{bal(w.eth_balance, weiToEth)}</Td>
      <Td>{w.task_count}</Td>
      <Td>
        {w.status === 'disabled' ? <Badge tone="gray">已禁用</Badge> : <Badge tone="green">正常</Badge>}
        {w.has_pending_withdrawal && <Badge tone="amber">提现中</Badge>}
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>编辑</Button>
          {w.status === 'active' && <Button size="sm" variant="ghost" onClick={onDisable}>禁用</Button>}
          <Button size="sm" variant="ghost" onClick={onWithdraw}>提现</Button>
          <Button size="sm" variant="ghost" onClick={onHistory}>提现记录</Button>
          <Button size="sm" variant="ghost" onClick={onExport}>导出</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={onDelete}>删除</Button>
        </div>
      </Td>
    </Tr>
  )
}
```

`CreateWalletDialog.tsx`：表单 `label`/`note`（`<Field label="标签"><Input id="label" …/></Field>`，用 `htmlFor`/`id` 让 `getByLabelText('标签')` 生效）→ `walletsApi.create` → 成功后同一对话框切到"结果视图"：新地址（等宽字体 + `CopyButton`）与提示"请向该地址转入 USDG 作为跟单资金，并转入少量 ETH 作为 gas。"，`onCreated()` 回调让页面失效列表。错误用 `toast.error(err.message)`。

`EditWalletDialog.tsx`：预填 `label`/`note`，"保存" → `walletsApi.update` → toast.success('已保存') → 失效列表。

`WalletsPage.tsx`：
- `useWallets()`；顶部标题"钱包"+ 右侧"创建钱包"按钮；`Table head={['标签', '地址', 'USDG', 'ETH', '任务数', '状态', '操作']}`；加载中显示"加载中…"，错误由全局 toast 处理并显示"加载失败"。
- 状态：`dialog: { kind: 'create' } | { kind: 'edit' | 'disable' | 'export' | 'delete' | 'withdraw' | 'history'; wallet: Wallet } | null`。
- 禁用用 `ConfirmDialog`（title `禁用钱包`，description `禁用后该钱包不再参与跟单，已有任务保持原样。`，confirmText `确认禁用`）→ `walletsApi.disable` → 失效。
- `export`/`delete`/`withdraw`/`history` 四种在本任务先渲染 `null`（Task 4/5 接入）。

`App.tsx`：`<Route path="/wallets" element={<WalletsPage />} />`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`
Expected: 全部 PASS（`App.test.tsx` 里断言 `/wallets` 标题"钱包"的用例仍成立——`WalletsPage` 的 `<h1>` 文案就是"钱包"）。`App.test.tsx` 需要把 `@/api/wallets` 也 mock 掉（`list` 返回 `[]`），否则壳测试会真的发请求。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/wallets web/src/app
git commit -m "feat(web): 钱包页——列表、创建、编辑备注、禁用"
```

---

### Task 4: 导出密文与删除钱包对话框

**Files:**
- Create: `web/src/features/wallets/ExportDialog.tsx`、`web/src/features/wallets/DeleteWalletDialog.tsx`
- Modify: `web/src/features/wallets/WalletsPage.tsx`（接入两种对话框）
- Test: `web/src/features/wallets/ExportDialog.test.tsx`、`web/src/features/wallets/DeleteWalletDialog.test.tsx`

**Interfaces:**
- Consumes: `signAction(action, params)`（`@/features/auth/auth`）、`walletsApi.exportKey/remove`、`ApiError`、`CopyButton`、`Dialog`、`Checkbox`。
- Produces:
```tsx
export function ExportDialog(props: { wallet: Wallet; open: boolean; onOpenChange(o: boolean): void })
export function DeleteWalletDialog(props: { wallet: Wallet; open: boolean; onOpenChange(o: boolean): void; onDeleted(): void })
```

- [ ] **Step 1: 写失败测试**

`ExportDialog.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/api/wallets', () => ({ walletsApi: { exportKey: vi.fn() } }))
vi.mock('@/features/auth/auth', () => ({ signAction: vi.fn() }))

import { ApiError } from '@/api/client'
import { walletsApi, type Wallet } from '@/api/wallets'
import { signAction } from '@/features/auth/auth'
import { useToasts } from '@/components/ui/toast'
import { ExportDialog } from './ExportDialog'

const w = { id: 7, address: '0xabc', label: 'w' } as Wallet
beforeEach(() => { vi.clearAllMocks(); useToasts.setState({ items: [] }) })

it('explains, signs, then shows the ciphertext with a copy button', async () => {
  vi.mocked(signAction).mockResolvedValue('0xsig')
  vi.mocked(walletsApi.exportKey).mockResolvedValue({ address: '0xabc', wallet_key: 'CIPHER' })
  render(<ExportDialog wallet={w} open onOpenChange={() => {}} />)
  expect(screen.getByText(/加密密文/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '签名并导出' }))
  expect(signAction).toHaveBeenCalledWith('export_wallet', { wallet_id: '7' })
  expect(walletsApi.exportKey).toHaveBeenCalledWith(7, '0xsig')
  expect(await screen.findByDisplayValue('CIPHER')).toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()
})

it('shows the rate-limit message on 429', async () => {
  vi.mocked(signAction).mockResolvedValue('0xsig')
  vi.mocked(walletsApi.exportKey).mockRejectedValue(new ApiError(429, '操作过于频繁，请稍后再试'))
  render(<ExportDialog wallet={w} open onOpenChange={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '签名并导出' }))
  expect(await screen.findByText('每分钟最多导出 3 次，请稍后再试')).toBeInTheDocument()
})
```

`DeleteWalletDialog.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/api/wallets', () => ({ walletsApi: { remove: vi.fn() } }))
vi.mock('@/features/auth/auth', () => ({ signAction: vi.fn() }))

import { ApiError } from '@/api/client'
import { walletsApi, type Wallet } from '@/api/wallets'
import { signAction } from '@/features/auth/auth'
import { DeleteWalletDialog } from './DeleteWalletDialog'

const w = { id: 7, address: '0xabc', label: 'w' } as Wallet
function renderDlg(onDeleted = vi.fn()) {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DeleteWalletDialog wallet={w} open onOpenChange={() => {}} onDeleted={onDeleted} />
    </MemoryRouter>,
  )
  return onDeleted
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(signAction).mockResolvedValue('0xsig') })

it('requires the acknowledgement, signs with force=0 and reports success', async () => {
  vi.mocked(walletsApi.remove).mockResolvedValue(undefined)
  const onDeleted = renderDlg()
  const btn = screen.getByRole('button', { name: '签名并删除' })
  expect(btn).toBeDisabled()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  await userEvent.click(btn)
  expect(signAction).toHaveBeenCalledWith('delete_wallet', { wallet_id: '7', force: '0' })
  expect(walletsApi.remove).toHaveBeenCalledWith(7, '0xsig', false)
  expect(onDeleted).toHaveBeenCalled()
})

it('lists referencing tasks on 409', async () => {
  vi.mocked(walletsApi.remove).mockRejectedValue(new ApiError(409, '钱包仍被任务引用', { error: '钱包仍被任务引用', task_ids: [3, 4] }))
  renderDlg()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  await userEvent.click(screen.getByRole('button', { name: '签名并删除' }))
  expect(await screen.findByText('钱包仍被任务引用')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '任务 #3' })).toHaveAttribute('href', '/tasks')
  expect(screen.getByRole('link', { name: '任务 #4' })).toBeInTheDocument()
})

it('offers force delete when the wallet still has balance and re-signs with force=1', async () => {
  vi.mocked(walletsApi.remove)
    .mockRejectedValueOnce(new ApiError(409, '钱包仍有余额', { error: '钱包仍有余额', usdg: '20000', eth: '0' }))
    .mockResolvedValueOnce(undefined)
  const onDeleted = renderDlg()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  await userEvent.click(screen.getByRole('button', { name: '签名并删除' }))
  expect(await screen.findByText(/USDG 0.02/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '仍然删除' }))
  expect(signAction).toHaveBeenLastCalledWith('delete_wallet', { wallet_id: '7', force: '1' })
  expect(walletsApi.remove).toHaveBeenLastCalledWith(7, '0xsig', true)
  expect(onDeleted).toHaveBeenCalled()
})

it('shows wait messages for in-flight withdrawal / unknown balance / busy', async () => {
  for (const msg of ['提现进行中', '余额未知', '钱包忙，请稍后重试']) {
    vi.mocked(walletsApi.remove).mockRejectedValueOnce(new ApiError(409, msg, { error: msg }))
  }
  renderDlg()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  for (const msg of ['提现进行中', '余额未知', '钱包忙，请稍后重试']) {
    await userEvent.click(screen.getByRole('button', { name: '签名并删除' }))
    expect(await screen.findByText(msg)).toBeInTheDocument()
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/wallets`
Expected: 模块不存在。

- [ ] **Step 3: 实现**

`ExportDialog.tsx`：
- 状态 `phase: 'explain' | 'busy' | 'done'`，`key: string`，`error: string | null`。
- 说明段落：`导出的是数据库里保存的加密密文，不能直接导入钱包；只有拿到服务端 WALLET_STORE_KEY 才能解密。请妥善保管，不要发给任何人。`
- 按钮"签名并导出"：`signAction('export_wallet', { wallet_id: String(wallet.id) })` → `walletsApi.exportKey(wallet.id, sig)` → `phase='done'`，`<Textarea readOnly value={key} rows={4} />` + `<CopyButton text={key} />`。
- 错误：`ApiError` 且 `status === 429` → `error = '每分钟最多导出 3 次，请稍后再试'`；否则 `error = err.message`。用 `<p role="alert">` 显示。
- 关闭对话框时把 `key` 清空（`useEffect` 监听 `open`）。

`DeleteWalletDialog.tsx`：
- 前置条件列表（无任务引用、无在途提现、余额 ≤ 0.01 USDG 且 ≤ 0.0001 ETH）、`<Checkbox label="我知道删除不可恢复" />` 控制按钮可用。
- `run(force: boolean)`：`signAction('delete_wallet', { wallet_id: String(wallet.id), force: force ? '1' : '0' })` → `walletsApi.remove(wallet.id, sig, force)` → `toast.success('钱包已删除')`、`onDeleted()`、`onOpenChange(false)`。
- 捕获 `ApiError`：`status === 409` 时按 `err.message` 分支：
  - `钱包仍被任务引用` → `taskIds = (err.data as {task_ids?: number[]}).task_ids ?? []`，渲染消息 + `<Link to="/tasks">任务 #{id}</Link>` 列表；
  - `钱包仍有余额` → 读 `usdg`/`eth`，渲染 `钱包仍有余额：USDG {unitsToUsdg(usdg)}，ETH {weiToEth(eth)}` 与按钮"仍然删除"（点击 `run(true)`）；
  - 其他 409（提现进行中/余额未知/钱包忙）→ 原文显示 + 一句"请稍后重试"。
  - 非 409 → `toast.error(err.message)`。
- 每次 `run` 前清空上一次的分支状态。

`WalletsPage.tsx`：`dialog.kind === 'export'` → `<ExportDialog …/>`；`'delete'` → `<DeleteWalletDialog … onDeleted={invalidate} />`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/wallets
git commit -m "feat(web): 钱包导出密文与删除对话框（动作签名、409 分支、强制删除）"
```

---

### Task 5: 提现对话框与提现记录

**Files:**
- Create: `web/src/features/wallets/WithdrawDialog.tsx`、`web/src/features/wallets/WithdrawalHistoryDialog.tsx`、`web/src/features/wallets/withdrawStatus.ts`
- Modify: `web/src/features/wallets/WalletsPage.tsx`
- Test: `web/src/features/wallets/WithdrawDialog.test.tsx`、`web/src/features/wallets/withdrawStatus.test.ts`

**Interfaces:**
- Consumes: `walletsApi.withdraw/withdrawals`、`withdrawalsApi.get`、`usdgToUnits`/`ethToWei`/`unitsToUsdg`/`weiToEth`、`txUrl`、`useSession`、`Reply`。
- Produces:
```ts
// withdrawStatus.ts
export function withdrawErrorText(err: ApiError): string   // 400 'insufficient' → '余额不足'；'insufficient gas' → 'ETH 不足以支付 gas'；其余原文
export function statusTone(s: Withdrawal['status']): 'gray' | 'blue' | 'green' | 'red'   // PENDING gray, SENT blue, CONFIRMED green, FAILED red
export function statusText(s: Withdrawal['status']): string   // 待发送 / 已广播 / 已确认 / 失败
export function isTerminal(s: Withdrawal['status']): boolean
// WithdrawDialog.tsx
export function WithdrawDialog(props: { wallet: Wallet; open: boolean; onOpenChange(o: boolean): void; onSubmitted(): void })
// WithdrawalHistoryDialog.tsx
export function WithdrawalHistoryDialog(props: { wallet: Wallet; open: boolean; onOpenChange(o: boolean): void })
```

- [ ] **Step 1: 写失败测试**

`withdrawStatus.test.ts`：
```ts
import { ApiError } from '@/api/client'
import { isTerminal, statusText, statusTone, withdrawErrorText } from './withdrawStatus'

it('maps errors and statuses', () => {
  expect(withdrawErrorText(new ApiError(400, 'insufficient'))).toBe('余额不足')
  expect(withdrawErrorText(new ApiError(400, 'insufficient gas'))).toBe('ETH 不足以支付 gas')
  expect(withdrawErrorText(new ApiError(409, '提现进行中'))).toBe('提现进行中')
  expect(statusText('SENT')).toBe('已广播')
  expect(statusTone('FAILED')).toBe('red')
  expect(isTerminal('CONFIRMED')).toBe(true)
  expect(isTerminal('PENDING')).toBe(false)
})
```

`WithdrawDialog.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/wallets', () => ({ walletsApi: { withdraw: vi.fn() }, withdrawalsApi: { get: vi.fn() } }))

import { ApiError } from '@/api/client'
import { walletsApi, withdrawalsApi, type Wallet, type Withdrawal } from '@/api/wallets'
import { useSession } from '@/features/auth/session'
import { makeQueryClient } from '@/app/queryClient'
import { WithdrawDialog } from './WithdrawDialog'

const w = { id: 7, address: '0xabc', label: 'w', usdg_balance: '12500000', eth_balance: '2000000000000000', status: 'active' } as Wallet
const wd = (status: Withdrawal['status'], error = ''): Withdrawal =>
  ({ id: 99, wallet_id: 7, asset: 'USDG', amount: '1000000', to_addr: '0xme', status, error, tx_hash: '0xhash', created_at: '', updated_at: '' })

function renderDlg() {
  const onSubmitted = vi.fn()
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <WithdrawDialog wallet={w} open onOpenChange={() => {}} onSubmitted={onSubmitted} />
    </QueryClientProvider>,
  )
  return onSubmitted
}
beforeEach(() => {
  vi.clearAllMocks()
  useSession.getState().setSession({ token: 't', address: '0x00000000000000000000000000000000000000me', role: 'user', expiresAt: '' })
})

it('shows balance and the fixed destination, submits USDG in units, then polls to CONFIRMED', async () => {
  vi.mocked(walletsApi.withdraw).mockResolvedValue({ status: 200, data: { id: 99, tx_hash: '0xhash', status: 'SENT' } })
  vi.mocked(withdrawalsApi.get).mockResolvedValueOnce(wd('SENT')).mockResolvedValue(wd('CONFIRMED'))
  const onSubmitted = renderDlg()
  expect(screen.getByText('可用 12.5 USDG')).toBeInTheDocument()
  expect(screen.getByDisplayValue('0x00000000000000000000000000000000000000me')).toHaveAttribute('readonly')
  await userEvent.type(screen.getByLabelText('金额'), '1')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(walletsApi.withdraw).toHaveBeenCalledWith(7, { asset: 'USDG', amount: '1000000' })
  expect(onSubmitted).toHaveBeenCalled()
  expect(await screen.findByText('已广播')).toBeInTheDocument()
  expect(screen.getByText('0xhash')).toBeInTheDocument()
  expect(await screen.findByText('已确认', {}, { timeout: 8000 })).toBeInTheDocument()
}, 10000)

it('sends "all" for ETH when the checkbox is on and shows the 202 note', async () => {
  vi.mocked(walletsApi.withdraw).mockResolvedValue({ status: 202, data: { id: 99, tx_hash: '0xhash', status: 'SENT', note: '已广播，状态待确认' } })
  vi.mocked(withdrawalsApi.get).mockResolvedValue(wd('SENT'))
  renderDlg()
  await userEvent.selectOptions(screen.getByLabelText('资产'), 'ETH')
  expect(screen.getByText('可用 0.002 ETH')).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('全部'))
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(walletsApi.withdraw).toHaveBeenCalledWith(7, { asset: 'ETH', amount: 'all' })
  expect(await screen.findByText('已广播，状态待确认')).toBeInTheDocument()
})

it('shows mapped 400 errors and FAILED with the backend error text', async () => {
  vi.mocked(walletsApi.withdraw).mockRejectedValueOnce(new ApiError(400, 'insufficient gas'))
  renderDlg()
  await userEvent.type(screen.getByLabelText('金额'), '1')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(await screen.findByText('ETH 不足以支付 gas')).toBeInTheDocument()

  vi.mocked(walletsApi.withdraw).mockResolvedValue({ status: 200, data: { id: 99, tx_hash: '0xhash', status: 'SENT' } })
  vi.mocked(withdrawalsApi.get).mockResolvedValue(wd('FAILED', 'dropped'))
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(await screen.findByText('失败')).toBeInTheDocument()
  expect(screen.getByText(/dropped/)).toBeInTheDocument()
  expect(screen.getByText(/请按哈希核对链上/)).toBeInTheDocument()
})

it('rejects a malformed amount before calling the API', async () => {
  renderDlg()
  await userEvent.type(screen.getByLabelText('金额'), '1.2.3')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(await screen.findByText('金额格式不正确')).toBeInTheDocument()
  expect(walletsApi.withdraw).not.toHaveBeenCalled()
})
```
轮询间隔在测试里太慢：`WithdrawDialog` 接受可选 prop `pollMs?: number`（默认 3000），测试传 `pollMs={50}`。上面 `renderDlg` 里加 `pollMs={50}`，并把第一个用例的 `timeout: 8000` 改成默认。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/wallets`
Expected: 模块不存在。

- [ ] **Step 3: 实现**

`withdrawStatus.ts`：按 Interfaces 实现（`withdrawErrorText`：`err.status === 400 && err.message === 'insufficient'` → `余额不足`；`'insufficient gas'` → `ETH 不足以支付 gas`；否则 `err.message`）。

`WithdrawDialog.tsx`：
- 状态：`asset: 'USDG'|'ETH'`（`<Select id="asset" options=[…]>` + `<Label htmlFor="asset">资产</Label>`）、`amount: string`、`all: boolean`（`Checkbox label="全部"`）、`error: string | null`、`result: WithdrawResult | null`。
- 余额行：`可用 {asset==='USDG' ? unitsToUsdg(w.usdg_balance) : weiToEth(w.eth_balance)} {asset}`（`balance_error` 时显示 `余额读取失败`）。
- 收款地址：`<Input readOnly value={session.address} />` + 说明"只能提到登录地址"。
- 提交：`amountUnits = all ? 'all' : (asset==='USDG' ? usdgToUnits(amount) : ethToWei(amount))`（`toUnits` 抛错 → `error = e.message`，不调 API；金额为 `'0'` 也拒绝：`金额必须大于 0`）→ `walletsApi.withdraw(w.id, {asset, amount})` → `result = data`，`note = status === 202 ? data.note : undefined`，`onSubmitted()`。
- 结果区：`已广播` 状态角标、哈希（`txUrl(hash)` 非空时为链接，否则文本 + `CopyButton`）、`note` 文本；随后 `useQuery({ queryKey: ['withdrawal', result.id], queryFn: () => withdrawalsApi.get(result.id), enabled: !!result, refetchInterval: (q) => (q.state.data && isTerminal(q.state.data.status) ? false : pollMs) })`，显示最新状态角标（`statusText`），`FAILED` 时显示 `error` 与"请按哈希核对链上"；`CONFIRMED` 显示"已确认"。
- 错误：`ApiError` → `withdrawErrorText(err)` 显示为 `role="alert"`；其他 → `toast.error`。

`WithdrawalHistoryDialog.tsx`：`useQuery({ queryKey: ['withdrawals', wallet.id], queryFn: () => walletsApi.withdrawals(wallet.id), enabled: open, refetchInterval: 10_000 })`，`Table head={['时间', '资产', '金额', '状态', '哈希', '错误']}`，金额按资产换算显示，状态用 `Badge tone={statusTone(s)}`，哈希用 `txUrl` 链接或 `shortAddress` 样式缩写 + `CopyButton`。

`WalletsPage.tsx`：接入 `'withdraw'` → `<WithdrawDialog … onSubmitted={invalidate} />`；`'history'` → `<WithdrawalHistoryDialog …/>`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/wallets
git commit -m "feat(web): 提现对话框（金额换算、200/202、状态轮询）与提现记录"
```

---

### Task 6: 目标地址页

**Files:**
- Create: `web/src/features/targets/useTargets.ts`、`web/src/features/targets/TargetsPage.tsx`、`web/src/features/targets/TargetDialog.tsx`
- Modify: `web/src/app/App.tsx`（`/targets`）
- Test: `web/src/features/targets/TargetsPage.test.tsx`

**Interfaces:**
- Produces:
```ts
export const targetKeys = { list: ['targets'] as const }
export function useTargets(): UseQueryResult<Target[]>       // refetchInterval 10_000
export function TargetDialog(props: { open: boolean; onOpenChange(o: boolean): void; target?: Target; onSaved(): void })  // 无 target = 新增（含地址），有 target = 编辑（只标签/备注）
```
Task 8 的向导第 1 步复用 `TargetDialog`（新增模式）。

- [ ] **Step 1: 写失败测试**

`TargetsPage.test.tsx`：
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }))
vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))

import { ApiError } from '@/api/client'
import { targetsApi, type Target } from '@/api/targets'
import { tasksApi } from '@/api/tasks'
import { makeQueryClient } from '@/app/queryClient'
import { useToasts } from '@/components/ui/toast'
import TargetsPage from './TargetsPage'

const t1: Target = { id: 1, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }
function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TargetsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  vi.mocked(targetsApi.list).mockResolvedValue([t1])
  vi.mocked(tasksApi.list).mockResolvedValue([{ id: 9, target_id: 1 } as never, { id: 10, target_id: 1 } as never])
})

it('lists targets with task counts', async () => {
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  expect(within(row).getByText('0x2222…2222')).toBeInTheDocument()
  expect(await within(row).findByText('2')).toBeInTheDocument()
})

it('validates the address and creates', async () => {
  vi.mocked(targetsApi.create).mockResolvedValue({ id: 2, address: '0x3333333333333333333333333333333333333333' })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '新增目标' }))
  await userEvent.type(screen.getByLabelText('地址'), 'not-an-address')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByText('地址格式不正确')).toBeInTheDocument()
  expect(targetsApi.create).not.toHaveBeenCalled()
  await userEvent.clear(screen.getByLabelText('地址'))
  await userEvent.type(screen.getByLabelText('地址'), '0x3333333333333333333333333333333333333333')
  await userEvent.type(screen.getByLabelText('标签'), '大户B')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(targetsApi.create).toHaveBeenCalledWith({ address: '0x3333333333333333333333333333333333333333', label: '大户B', note: '' })
})

it('edits and deletes, showing the 409 text', async () => {
  vi.mocked(targetsApi.update).mockResolvedValue(undefined)
  vi.mocked(targetsApi.remove).mockRejectedValue(new ApiError(409, '目标仍被任务引用: 2 个任务'))
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }))
  expect(screen.queryByLabelText('地址')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('备注'), '观察')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(targetsApi.update).toHaveBeenCalledWith(1, { label: '大户A', note: '观察' })

  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await screen.findByText(/目标仍被任务引用/)).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/targets`

- [ ] **Step 3: 实现**

`useTargets.ts` 同 `useWallets` 结构。`TargetsPage.tsx`：`useTargets()` + `useQuery(['tasks'], tasksApi.list)` 统计每个目标的任务数；表格列：地址（缩写 + 复制 + `txUrl` 不适用于地址，因此不做链接）、标签、备注、任务数、操作（编辑、删除）。删除用 `ConfirmDialog`（confirmText `确认删除`）→ `targetsApi.remove` → 409 时 `toast.error(err.message)`（全局 mutation onError 已会 toast，这里只需让 mutation 抛错；测试断言的文本来自 toast）。

`TargetDialog.tsx`：新增模式字段 地址/标签/备注，地址用 viem `isAddress` 校验（失败显示 `地址格式不正确`）；编辑模式只标签/备注，预填；"保存" → `create`/`update` → `onSaved()` → 关闭。重复地址 409 → `toast.error`。

`App.tsx`：`/targets` → `<TargetsPage />`；`App.test.tsx` mock `@/api/targets`、`@/api/tasks`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add web/src/features/targets web/src/app
git commit -m "feat(web): 目标地址页（增删改、引用计数）"
```

---

### Task 7: 策略 schema、默认值与后端换算

**Files:**
- Create: `web/src/features/tasks/strategySchema.ts`
- Test: `web/src/features/tasks/strategySchema.test.ts`

**Interfaces:**
- Produces:
```ts
export const PLATFORMS = [{ value: 'pons_curve', label: '内盘' }, { value: 'pons_pool', label: '内盘毕业池' }, { value: 'uniswap', label: 'Uniswap' }] as const
export const QUOTE_ASSETS = [{ value: 'USDG', label: 'USDG' }, { value: 'ETH', label: 'ETH' }, { value: 'STOCK', label: '股票代币' }] as const
export const strategySchema: z.ZodType<StrategyValues>
export interface StrategyValues {
  size_mode: 'fixed' | 'ratio'; size_value: string; max_per_trade: string; min_target_trade: string; spend_limit: string; max_addon_per_token: number;
  sell_mode: 'manual' | 'proportional' | 'all';
  tp_enabled: boolean; take_profit_pct: number; take_profit_sell_pct: number; stop_loss_pct: number; max_hold_min: number;
  platforms: string[]; quote_assets: string[]; follow_curve: boolean;
  max_creator_tax_pct: number; skip_launch_window_sec: number; max_chase_pct: number; slippage_pct: number; retry_max: number;
  token_blacklist: string   // 每行一个地址
}
export const defaultStrategy: StrategyValues
export function toBackend(v: StrategyValues, ids: { wallet_id: number; target_id: number }): TaskInput
export function fromBackend(t: TaskInput): StrategyValues
```

- [ ] **Step 1: 写失败测试**

`strategySchema.test.ts`：
```ts
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

it('round-trips through the backend shape', () => {
  const v = { ...defaultStrategy, size_mode: 'ratio' as const, size_value: '7.5', tp_enabled: true, take_profit_pct: 25, take_profit_sell_pct: 40, stop_loss_pct: 10, max_hold_min: 30, token_blacklist: '0x1111111111111111111111111111111111111111' }
  expect(fromBackend(toBackend(v, ids))).toEqual(v)
  expect(fromBackend(toBackend(defaultStrategy, ids))).toEqual({ ...defaultStrategy, take_profit_sell_pct: 50 })
})
```
（默认值里 `take_profit_sell_pct` 就是 50，最后一行的期望与 `defaultStrategy` 相同；写成展开是为了强调关闭止盈时后端存 0、回读时恢复默认 50。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks`

- [ ] **Step 3: 实现**

`strategySchema.ts`：
```ts
import { isAddress } from 'viem'
import { z } from 'zod'
import type { TaskInput } from '@/api/tasks'
import { bpsToPct, pctToBps, unitsToUsdg, usdgToUnits } from '@/lib/amount'

export const PLATFORMS = [...] as const
export const QUOTE_ASSETS = [...] as const

const amount = z.string().refine((s) => { try { usdgToUnits(s); return true } catch { return false } }, '金额格式不正确')

export const strategySchema = z
  .object({
    size_mode: z.enum(['fixed', 'ratio']),
    size_value: z.string(),
    max_per_trade: amount,
    min_target_trade: amount,
    spend_limit: amount,
    max_addon_per_token: z.number().int().min(1, '至少 1 次'),
    sell_mode: z.enum(['manual', 'proportional', 'all']),
    tp_enabled: z.boolean(),
    take_profit_pct: z.number().min(0),
    take_profit_sell_pct: z.number().min(0.01, '止盈卖出比例须在 0.01–100').max(100, '止盈卖出比例须在 0.01–100'),
    stop_loss_pct: z.number().min(0).lt(100, '止损比例须小于 100'),
    max_hold_min: z.number().int().min(0),
    platforms: z.array(z.string()).min(1, '至少选一个场所'),
    quote_assets: z.array(z.string()).min(1, '至少选一种计价币'),
    follow_curve: z.boolean(),
    max_creator_tax_pct: z.number().min(0).max(100),
    skip_launch_window_sec: z.number().int().min(0),
    max_chase_pct: z.number().min(0),
    slippage_pct: z.number().gt(0, '滑点须在 0–100 之间').lt(100, '滑点须在 0–100 之间'),
    retry_max: z.number().int().min(0),
    token_blacklist: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.size_mode === 'fixed') {
      try {
        if (usdgToUnits(v.size_value) === '0') ctx.addIssue({ code: 'custom', path: ['size_value'], message: '金额必须大于 0' })
      } catch {
        ctx.addIssue({ code: 'custom', path: ['size_value'], message: '金额格式不正确' })
      }
    } else {
      const n = Number(v.size_value)
      if (!Number.isFinite(n) || v.size_value.trim() === '') ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例格式不正确' })
      else if (n <= 0) ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例必须大于 0' })
      else if (n > 100) ctx.addIssue({ code: 'custom', path: ['size_value'], message: '比例不能超过 100' })
    }
    try {
      if (usdgToUnits(v.max_per_trade) === '0') ctx.addIssue({ code: 'custom', path: ['max_per_trade'], message: '单笔上限必须大于 0' })
    } catch { /* amount 校验已报 */ }
    parseBlacklist(v.token_blacklist).forEach((a, i) => {
      if (!isAddress(a)) ctx.addIssue({ code: 'custom', path: ['token_blacklist'], message: `黑名单第 ${i + 1} 行不是合法地址` })
    })
  })

export type StrategyValues = z.infer<typeof strategySchema>

export const defaultStrategy: StrategyValues = {
  size_mode: 'fixed', size_value: '10', max_per_trade: '20', min_target_trade: '5', spend_limit: '0', max_addon_per_token: 1,
  sell_mode: 'proportional', tp_enabled: false, take_profit_pct: 0, take_profit_sell_pct: 50, stop_loss_pct: 0, max_hold_min: 0,
  platforms: ['pons_curve', 'pons_pool', 'uniswap'], quote_assets: ['USDG', 'ETH'], follow_curve: true,
  max_creator_tax_pct: 2, skip_launch_window_sec: 15, max_chase_pct: 15, slippage_pct: 10, retry_max: 2, token_blacklist: '',
}

function parseBlacklist(s: string): string[] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.toLowerCase())
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
    max_hold_sec: v.tp_enabled ? v.max_hold_min * 60 : 0,
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
    max_hold_min: Math.round(t.max_hold_sec / 60),
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
```
注意：`tp_enabled` 关闭时 `take_profit_sell_bps` 提交 0，后端会存默认 5000；回读时 `tp_enabled=false`、`take_profit_sell_pct=50`，与测试一致。zod 4 的 `ctx.addIssue` 用 `{ code: 'custom', … }`；若 `z.infer` 与手写 `StrategyValues` 接口有出入，以 `z.infer` 为准并导出它。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run src/features/tasks`

- [ ] **Step 5: 提交**

```bash
git add web/src/features/tasks
git commit -m "feat(web): 策略表单 schema、默认值与后端单位换算"
```

---

### Task 8: 策略表单与新建向导、编辑页

**Files:**
- Create: `web/src/features/tasks/StrategyForm.tsx`、`web/src/features/tasks/TaskWizardPage.tsx`、`web/src/features/tasks/TaskEditPage.tsx`、`web/src/features/tasks/useTasks.ts`
- Modify: `web/src/app/App.tsx`（`/tasks/new`、`/tasks/:id/edit`）
- Test: `web/src/features/tasks/StrategyForm.test.tsx`、`web/src/features/tasks/TaskWizardPage.test.tsx`

**Interfaces:**
- Consumes: Task 7 `strategySchema`/`defaultStrategy`/`toBackend`/`fromBackend`/`PLATFORMS`/`QUOTE_ASSETS`；Task 6 `useTargets`、`TargetDialog`；Task 3 `useWallets`；`tasksApi`。
- Produces:
```tsx
export const taskKeys = { list: ['tasks'] as const }
export function useTasks(): UseQueryResult<Task[]>                     // refetchInterval 10_000
export function StrategyForm(props: { defaultValues: StrategyValues; submitText: string; busy?: boolean; onSubmit(values: StrategyValues): void })
export default function TaskWizardPage()   // 路由 /tasks/new
export default function TaskEditPage()     // 路由 /tasks/:id/edit
```

- [ ] **Step 1: 写失败测试**

`StrategyForm.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrategyForm } from './StrategyForm'
import { defaultStrategy } from './strategySchema'

it('submits defaults, toggles ratio label and take-profit block, shows validation errors', async () => {
  const onSubmit = vi.fn()
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={onSubmit} />)
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  expect(screen.queryByLabelText('止盈（%）')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenCalledWith(defaultStrategy)

  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('比例（%）')).toBeInTheDocument()

  await userEvent.click(screen.getByLabelText('开启止盈止损'))
  expect(screen.getByLabelText('止盈（%）')).toBeInTheDocument()
  expect(screen.getByLabelText('止盈卖出比例（%）')).toHaveValue(50)

  const slip = screen.getByLabelText('滑点（%）')
  await userEvent.clear(slip)
  await userEvent.type(slip, '0')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('滑点须在 0–100 之间')).toBeInTheDocument()
  expect(onSubmit).toHaveBeenCalledTimes(1)
})
```

`TaskWizardPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/tasks', () => ({ tasksApi: { create: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { tasksApi } from '@/api/tasks'
import { makeQueryClient } from '@/app/queryClient'
import TaskWizardPage from './TaskWizardPage'
import { defaultStrategy, toBackend } from './strategySchema'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([
    { id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active', usdg_balance: '5000000', eth_balance: '0', task_count: 0, has_pending_withdrawal: false, note: '', created_at: '' },
    { id: 3, address: '0x3333333333333333333333333333333333333333', label: '停用', status: 'disabled', usdg_balance: '0', eth_balance: '0', task_count: 0, has_pending_withdrawal: false, note: '', created_at: '' },
  ])
  vi.mocked(tasksApi.create).mockResolvedValue({ id: 10 })
})

it('walks target → wallet → strategy and creates the task', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/tasks/new']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tasks/new" element={<TaskWizardPage />} />
          <Route path="/tasks" element={<div>任务列表</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await userEvent.selectOptions(await screen.findByLabelText('目标地址'), '2')
  await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  const walletSelect = await screen.findByLabelText('跟单钱包')
  expect(walletSelect).not.toHaveTextContent('停用')
  await userEvent.selectOptions(walletSelect, '1')
  expect(screen.getByText(/5 USDG/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  await userEvent.click(await screen.findByRole('button', { name: '创建任务' }))
  expect(tasksApi.create).toHaveBeenCalledWith(toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }))
  expect(await screen.findByText('任务列表')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks`

- [ ] **Step 3: 实现**

`useTasks.ts`：同 `useWallets` 结构（`taskKeys.list = ['tasks']`）。

`StrategyForm.tsx`（react-hook-form + zodResolver）：
- `const form = useForm<StrategyValues>({ resolver: zodResolver(strategySchema), defaultValues })`；`const sizeMode = form.watch('size_mode')`、`tp = form.watch('tp_enabled')`。
- 分组卡片：买入、卖出、止盈止损、过滤。每个数字字段 `register('x', { valueAsNumber: true })`，金额字段字符串 `register('x')`。所有 `<Input id=…>` 配 `<Field label>` 里的 `<Label htmlFor>`（`Field` 接受 `htmlFor` 透传，或在 `Field` 里用 `id` 属性——实现时给 `Field` 加可选 `htmlFor` prop）。
- 标签文案（测试依赖）：`买入模式`（Select 选项 `固定金额`/`按比例`）、`固定金额（USDG）` 或 `比例（%）`、`单笔上限（USDG）`、`目标最小交易额（USDG）`、`总额度（USDG，0=不限）`、`单币加仓次数`、`卖出模式`（`手动`/`按比例`/`全部`，下方一句说明：手动 = 只手动卖出，不发提醒；按比例 = 目标卖多少比例我们卖多少；全部 = 目标一卖我们全清）、`开启止盈止损`（Checkbox）、`止盈（%）`、`止盈卖出比例（%）`、`止损（%）`、`最长持仓（分钟）`、场所多选（三个 Checkbox，用 `Controller` 管理数组）、计价币多选、`跟内盘`、`创建者税上限（%）`、`发射后跳过（秒）`、`追价上限（%）`、`滑点（%）`、`重试次数`、`黑名单地址（每行一个）`（Textarea）。
- 错误显示：`form.formState.errors.x?.message` 交给 `Field.error`。
- 提交按钮文案 `submitText`，`busy` 时禁用。

`TaskWizardPage.tsx`：
- `step: 1 | 2 | 3`；顶部步骤指示"1 选目标 → 2 选钱包 → 3 设策略"。
- 步骤 1：`useTargets()` → `<Select id="target" options=[{value: String(id), label: `${label || '（未命名）'} ${shortAddress(address)}`}]>` + `<Label htmlFor="target">目标地址</Label>`，旁边"新增目标"按钮打开 `TargetDialog`（`onSaved` 后失效目标列表并选中新目标）。未选中时"下一步"禁用；列表为空时提示先新增。
- 步骤 2：`useWallets()` 过滤 `status === 'active'` → `<Select id="wallet">` 标签 `跟单钱包`；选中后显示 `余额 {unitsToUsdg(usdg_balance)} USDG / {weiToEth(eth_balance)} ETH`；"上一步"/"下一步"。
- 步骤 3：`<StrategyForm defaultValues={defaultStrategy} submitText="创建任务" busy={mutation.isPending} onSubmit={(v) => mutation.mutate(toBackend(v, { wallet_id, target_id }))} />`；成功 → `toast.success('任务已创建')`、失效 `taskKeys.list`、`navigate('/tasks')`。

`TaskEditPage.tsx`：`useParams().id` → `useTasks()` 找到任务（未找到显示"任务不存在"）→ `<StrategyForm defaultValues={fromBackend(task)} submitText="保存" …/>` → `tasksApi.update(id, toBackend(v, { wallet_id: task.wallet_id, target_id: task.target_id }))` → toast、失效、`navigate('/tasks')`。页面顶部显示目标与钱包（只读）。

`App.tsx` 加 `<Route path="/tasks/new" element={<TaskWizardPage />} />`、`<Route path="/tasks/:id/edit" element={<TaskEditPage />} />`（在壳内）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add web/src/features/tasks web/src/app web/src/components/ui/field.tsx
git commit -m "feat(web): 策略表单、新建跟单三步向导与编辑页"
```

---

### Task 9: 任务列表页（状态、进度、启停、编辑、删除）

**Files:**
- Create: `web/src/features/tasks/TasksPage.tsx`、`web/src/features/tasks/TaskRow.tsx`
- Modify: `web/src/app/App.tsx`（`/tasks`）
- Test: `web/src/features/tasks/TasksPage.test.tsx`

**Interfaces:**
- Consumes: `useTasks`、`useTargets`、`useWallets`、`tasksApi.enable/disable/remove`、`ConfirmDialog`、`Badge`、`unitsToUsdg`。

- [ ] **Step 1: 写失败测试**

`TasksPage.test.tsx`：
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn(), enable: vi.fn(), disable: vi.fn(), remove: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))

import { ApiError } from '@/api/client'
import { tasksApi, type Task } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { makeQueryClient } from '@/app/queryClient'
import { useToasts } from '@/components/ui/toast'
import TasksPage from './TasksPage'
import { defaultStrategy, toBackend } from './strategySchema'

const base = toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 })
const t1: Task = { ...base, id: 10, owner: '0xabc', enabled: true, spent_usdg: '5000000', consecutive_failures: 0, paused_reason: '', paused_at: null, spend_limit_usdg: '20000000' }
const t2: Task = { ...base, id: 11, owner: '0xabc', enabled: false, spent_usdg: '0', consecutive_failures: 0, paused_reason: 'admin', paused_at: null }

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/tasks']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<div>向导页</div>} />
          <Route path="/tasks/:id/edit" element={<div>编辑页</div>} />
          <Route path="/positions" element={<div>仓位页</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  vi.mocked(tasksApi.list).mockResolvedValue([t1, t2])
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([{ id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active', usdg_balance: '0', eth_balance: '0', task_count: 1, has_pending_withdrawal: false, note: '', created_at: '' }])
})

it('lists tasks with target/wallet labels, status badges, progress and mode summary', async () => {
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  expect(within(row).getByText('主钱包')).toBeInTheDocument()
  expect(within(row).getByText('运行中')).toBeInTheDocument()
  expect(within(row).getByText('5 / 20 USDG')).toBeInTheDocument()
  expect(within(row).getByText('固定 10 USDG · 按比例卖')).toBeInTheDocument()
  const row2 = screen.getByText('管理员禁用').closest('tr')!
  expect(within(row2).getByText('不限')).toBeInTheDocument()
  expect(within(row2).getByRole('button', { name: '启用' })).toBeDisabled()
})

it('stops, enables, navigates to edit and to the wizard', async () => {
  vi.mocked(tasksApi.disable).mockResolvedValue(undefined)
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '停止' }))
  expect(tasksApi.disable).toHaveBeenCalledWith(10)
  await userEvent.click(within(row).getByRole('link', { name: '编辑' }))
  expect(await screen.findByText('编辑页')).toBeInTheDocument()
})

it('deletes with confirmation; 409 links to positions; warning is toasted', async () => {
  vi.mocked(tasksApi.remove).mockRejectedValueOnce(new ApiError(409, '任务仍有持仓，请先卖出')).mockResolvedValueOnce({ ok: true, warning: '配置重载失败，引擎会在下次配置变更时刷新' })
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await screen.findByText(/任务仍有持仓/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '去仓位页' })).toHaveAttribute('href', '/positions')

  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await screen.findByText(/配置重载失败/)).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks`

- [ ] **Step 3: 实现**

`TaskRow.tsx`：
- 列：目标（标签 + 缩写地址，找不到显示 `#target_id`）、钱包（标签）、状态：`enabled` → `<Badge tone="green">运行中</Badge>`；否则 `paused_reason === 'admin'` → `<Badge tone="red">管理员禁用</Badge>`，其他 → `<Badge tone="gray">已停止</Badge>`；进度：`spend_limit_usdg === '0'` → `不限`，否则 `${unitsToUsdg(spent)} / ${unitsToUsdg(limit)} USDG` + 一条比例条；摘要：`${size_mode==='fixed' ? `固定 ${unitsToUsdg(size_value)} USDG` : `比例 ${bpsToPct(Number(size_value))}%`} · ${sellModeText}`（手动卖/按比例卖/全部卖）+ 止盈止损开着时追加 ` · 止盈止损`。
- 操作：`enabled` → 按钮"停止"；否则"启用"（`paused_reason === 'admin'` 时 `disabled` 并 `title="任务被管理员禁用，请联系管理员恢复"`）；`<Link to={`/tasks/${id}/edit`}>编辑</Link>`（`Button asChild`? 简单起见用 `Link` 加按钮样式类）；"删除"；`<Link to="/positions">仓位</Link>`（计划 C 会做按任务过滤，这里先跳总页）。

`TasksPage.tsx`：标题"跟单" + 右侧 `<Link to="/tasks/new">新建跟单</Link>`；三个查询（tasks/targets/wallets）做 id → 对象映射；表格；启停 mutation 成功后失效 `tasks`；删除用 `ConfirmDialog`（description `删除后该任务的历史决策仍保留，仓位必须为空。`，confirmText `确认删除`）：成功 → `toast.success('任务已删除')`，`warning` 存在 → `toast.info(warning)`；`ApiError 409` → 对话框内显示原文 + `<Link to="/positions">去仓位页</Link>`；其他错误 → toast。

`App.tsx`：`/tasks` → `<TasksPage />`；`App.test.tsx` 的 `/tasks` 相关断言按需补 mock（`@/api/tasks` 等已在前面任务里 mock）。

- [ ] **Step 4: 跑全部门禁**

Run: `cd web && npm run typecheck && npm test -- --run && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 5: README**

`README.md` 开发章节补一句：`VITE_EXPLORER_BASE`（构建期，可选）配置区块浏览器交易页前缀，用于提现哈希链接。

- [ ] **Step 6: 提交**

```bash
git add web/src/features/tasks web/src/app README.md
git commit -m "feat(web): 跟单任务列表（状态、额度进度、启停、编辑、删除）"
```

---

## 自查记录

- **Spec 覆盖**：§6 钱包池全部功能（T3 列表/创建/备注/禁用，T4 导出与删除含 5 种 409 分支与强制删除，T5 提现与历史）；§7 目标（T6）；§8.1 向导与编辑（T8）、§8.2 表单字段与换算表、默认值、校验（T7/T8）、§8.3 列表与操作（T9）；§9 提现对话框与历史（T5）；§4 的 `ApiError.data` 用于 409 载荷（T1 `requestFull` 补了 202 识别）。
- **占位扫描**：无 TBD；`WalletRow` 的六个回调在 T3 先接空实现是有意分期。
- **类型一致性**：`walletsApi.withdraw` 返回 `Reply<WithdrawResult>`（T1 定义，T5 消费）；`signAction(action, params)` 来自计划 A；`StrategyValues`/`toBackend`/`fromBackend` 在 T7 定义、T8/T9 消费；`TargetDialog` 在 T6 定义、T8 复用；`Field` 的 `htmlFor` 在 T8 补充，T2 的 `Field` 接口保持向后兼容。
- **已知取舍**：Select/Checkbox 用原生元素（jsdom 可测、少依赖）；Dialog 用 Radix；区块浏览器地址通过构建期变量配置，未配置时只显示哈希。
