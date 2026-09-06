# go-follow-front 计划 C：仓位/决策/信号、管理员、冒烟脚本 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剩余占位页做成真实功能（仓位与手动卖出、决策与信号列表、管理员总览/用户/全站数据/审计/全局开关），补请求超时与地址浏览器链接，并提供一个对着真实 gofollow 跑的端到端冒烟脚本。

**Architecture:** 延续计划 B/D 的结构：每个资源一个 `api/<资源>.ts`，页面在 `features/<功能>/` 下，数据经 TanStack Query，写操作经 `useMutation`；管理员页面全部挂在 `RequireAdmin` 下，只读列表共用一个带 owner 过滤的标签页组件。冒烟脚本是独立的 Node 脚本（`scripts/smoke.mjs`），用 viem 本地私钥完成 SIWE 登录后按顺序调 API，不依赖浏览器。

**Tech Stack:** 计划 A/B/D 的栈；冒烟脚本用 Node 22 + `viem`（已是依赖）。

**Spec:** `docs/superpowers/specs/2026-09-06-frontend-design.md` §9（仓位、决策、信号）、§10（管理员）、§13（测试）；§4/§5 通用约定。

## Global Constraints

- 后端契约（go-follow `6008624`）：
  - 仓位 `GET /tasks/:id/positions` → `{id, task_id, token, qty, cost_usdg, avg_price_usdg, addon_count, tp_done, realized_usdg, virtual, updated_at, exit_fail_count, last_exit_error, next_exit_at}[]`；卖出 `POST /positions/:id/sell {pct_bps}`（1–10000）→ `{outcome, reason, sell_qty, quoted_out}`，失败 400/409 `error`。
  - 决策 `GET /decisions?task=&outcome=&limit=`（`limit` 默认 100，最大 1000）→ `{id, signal_id, task_id, side, outcome, reason, planned_amount_in, planned_min_out, quoted_out, quoted_price_usdg, t_seen, t_decided, t_quoted, error, created_at}[]`。
  - 信号 `GET /signals?target=&since=&limit=` → `{id, block, tx_hash, target_addr, side, token, token_amount, quote_asset, quote_amount, quote_token, venue, venue_addr, target_balance_before, target_balance_after, fill_price_usdg, seen_at}[]`。
  - 管理员：`GET /admin/overview` → `{targets, tasks, tasks_enabled, positions_open, decisions_today, spent_usdg, engine: {engine_last_block, node_block, last_signal_at, kill_switch, dry_run, stock_tokens, exit_scan_last_at, exit_scan_errors, exit_scan_backoff, positions_blocked, node_error?, goswapevm_error?}}`；`GET /admin/users` → `{address, locked, created_at, role, wallets, tasks, positions_open}[]`；`POST /admin/users/:address/lock|unlock`；`GET /admin/tasks|positions|decisions|wallets|withdrawals?owner=&limit=`（positions/wallets 行多 `owner`）；`POST /admin/tasks/:id/disable|enable`；`GET /admin/audit?owner=&action=&limit=` → `{id, owner, action, detail, ip, created_at}[]`；`PUT /settings/kill_switch|dry_run {on}`。
- 轮询：列表 10 s，总览 10 s；查询失败用 `meta: { silent: true }` + 行内 `加载失败`；写操作 `useMutation`（默认全局 toast；行内处理的用 `meta.silent`）。
- 请求超时：`client.ts` 用 `AbortController`，默认 30 s，超时抛 `ApiError(0, '请求超时')`。
- 浏览器链接：`lib/explorer.ts` 新增 `addressUrl(addr)`，读 `VITE_EXPLORER_ADDRESS_BASE`（如 `https://explorer.example/address/`），未配置返回 `null`；钱包页、目标页、信号页的地址在配置时渲染为链接。
- 文案（verbatim）：结果角标 `DRY_RUN`→绿 / `SKIPPED`→灰 / `FAILED`→红 / 其他→蓝；`退出受阻：{last_exit_error}，连续 {n} 次，下次尝试 {HH:MM}`；仓位 `dry-run` 角标；卖出按钮 `卖出`、对话框标题 `手动卖出`、确认 `确认卖出`；管理员开关确认文案 `确认打开全局停止？所有任务将停止跟单` / `确认关闭全局停止？` / `确认切换 dry-run？`；锁定确认 `锁定后该用户无法登录，已在途的提现不受影响`；`加载更多`。
- 时间显示用本地时区 `YYYY-MM-DD HH:mm:ss`（`lib/format.ts` 新增 `fmtTime(iso)`）。
- Router 带 v7 `future` 标志；`vi.clearAllMocks()`；测试输出洁净；每个任务结束 `cd web && npm run typecheck && npm test -- --run` 全绿；最后一个任务再 `npm run build`。提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。
- 不做：多页签、暗色、移动端、i18n、HTTPS。

---

### Task 1: API 层（仓位/决策/信号/管理员）、请求超时、地址链接、时间格式化

**Files:**
- Modify: `web/src/api/client.ts`（超时）、`web/src/lib/explorer.ts`、`web/src/lib/format.ts`、`web/src/vite-env.d.ts`、`web/.env.example`
- Create: `web/src/api/positions.ts`、`web/src/api/decisions.ts`、`web/src/api/signals.ts`、`web/src/api/admin.ts`
- Test: `web/src/api/client.test.ts`（追加）、`web/src/api/resources2.test.ts`、`web/src/lib/format.test.ts`（追加）、`web/src/lib/explorer.test.ts`

**Interfaces:**
```ts
// client.ts
export const REQUEST_TIMEOUT_MS = 30_000
export function requestFull<T>(method, path, body?, opts?: { timeoutMs?: number }): Promise<Reply<T>>   // 超时 → ApiError(0, '请求超时')
// positions.ts
export interface Position { id: number; task_id: number; token: string; qty: string; cost_usdg: string; avg_price_usdg: number; addon_count: number; tp_done: boolean; realized_usdg: string; virtual: boolean; updated_at: string; exit_fail_count: number; last_exit_error: string; next_exit_at: string | null }
export interface SellResult { outcome: string; reason: string; sell_qty: string; quoted_out: string }
export const positionsApi: { byTask(taskId: number): Promise<Position[]>; sell(id: number, pctBps: number): Promise<SellResult> }
// decisions.ts
export interface Decision { id: number; signal_id: number | null; task_id: number; side: 'BUY' | 'SELL'; outcome: string; reason: string; planned_amount_in: string; planned_min_out: string; quoted_out: string; quoted_price_usdg: number; t_seen: string | null; t_decided: string | null; t_quoted: string | null; error: string; created_at: string }
export const decisionsApi: { list(p: { task?: number; outcome?: string; limit: number }): Promise<Decision[]> }   // 查询串只带非空项
// signals.ts
export interface Signal { id: number; block: number; tx_hash: string; target_addr: string; side: 'BUY' | 'SELL'; token: string; token_amount: string; quote_asset: string; quote_amount: string; quote_token: string; venue: string; venue_addr: string; target_balance_before: string | null; target_balance_after: string | null; fill_price_usdg: number; seen_at: string }
export const signalsApi: { list(p: { target?: string; since?: string; limit: number }): Promise<Signal[]> }
// admin.ts
export interface Overview { targets: number; tasks: number; tasks_enabled: number; positions_open: number; decisions_today: number; spent_usdg: string; engine: { engine_last_block: number; node_block: number; last_signal_at: string | null; kill_switch: boolean; dry_run: boolean; stock_tokens: number; exit_scan_last_at: string | null; exit_scan_errors: number; exit_scan_backoff: number; positions_blocked: number; node_error?: string; goswapevm_error?: string } }
export interface AdminUser { address: string; locked: boolean; created_at: string; role: 'admin' | 'user'; wallets: number; tasks: number; positions_open: number }
export interface AuditRow { id: number; owner: string; action: string; detail: string; ip: string; created_at: string }
export const adminApi: {
  overview(): Promise<Overview>; users(): Promise<AdminUser[]>; lockUser(address: string): Promise<void>; unlockUser(address: string): Promise<void>;
  tasks(owner?: string): Promise<Task[]>; positions(owner?: string): Promise<(Position & { owner: string })[]>; decisions(owner?: string): Promise<Decision[]>;
  wallets(owner?: string): Promise<(Wallet & { owner: string })[]>; withdrawals(owner?: string): Promise<Withdrawal[]>;
  enableTask(id: number): Promise<void>; disableTask(id: number): Promise<void>;
  audit(p: { owner?: string; action?: string; limit: number }): Promise<AuditRow[]>;
  setSetting(key: 'kill_switch' | 'dry_run', on: boolean): Promise<void>;
}
// explorer.ts
export function addressUrl(addr: string): string | null
// format.ts
export function fmtTime(iso: string | null | undefined): string   // '' → '—'；本地时区 'YYYY-MM-DD HH:mm:ss'
```

- [ ] **Step 1: 写失败测试**

`client.test.ts` 追加（在 `describe('request')` 内）：
```ts
  it('aborts after the timeout and maps it to 请求超时', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    )
    const p = requestFull('GET', '/health', undefined, { timeoutMs: 1000 })
    const assertion = expect(p).rejects.toMatchObject({ status: 0, message: '请求超时' })
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    vi.useRealTimers()
  })
```

`web/src/api/resources2.test.ts`：
```ts
import * as client from './client'
import { positionsApi } from './positions'
import { decisionsApi } from './decisions'
import { signalsApi } from './signals'
import { adminApi } from './admin'

const req = vi.spyOn(client, 'request')
beforeEach(() => req.mockReset().mockResolvedValue({}))

it('positions / sell', async () => {
  await positionsApi.byTask(3)
  await positionsApi.sell(9, 5000)
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/tasks/3/positions', undefined],
    ['POST', '/positions/9/sell', { pct_bps: 5000 }],
  ])
})

it('decisions / signals build query strings with only present params', async () => {
  await decisionsApi.list({ limit: 50 })
  await decisionsApi.list({ task: 3, outcome: 'SKIPPED', limit: 100 })
  await signalsApi.list({ limit: 50 })
  await signalsApi.list({ target: '0xabc', since: '2026-09-06T00:00:00Z', limit: 100 })
  expect(req.mock.calls.map((c) => c[1])).toEqual([
    '/decisions?limit=50',
    '/decisions?task=3&outcome=SKIPPED&limit=100',
    '/signals?limit=50',
    '/signals?target=0xabc&since=2026-09-06T00%3A00%3A00Z&limit=100',
  ])
})

it('admin routes', async () => {
  await adminApi.overview()
  await adminApi.users()
  await adminApi.lockUser('0xAbC')
  await adminApi.unlockUser('0xabc')
  await adminApi.tasks()
  await adminApi.tasks('0xabc')
  await adminApi.positions('0xabc')
  await adminApi.decisions()
  await adminApi.wallets('0xabc')
  await adminApi.withdrawals()
  await adminApi.enableTask(5)
  await adminApi.disableTask(5)
  await adminApi.audit({ limit: 100 })
  await adminApi.audit({ owner: '0xabc', action: 'withdraw', limit: 200 })
  await adminApi.setSetting('kill_switch', true)
  expect(req.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
    ['GET', '/admin/overview', undefined],
    ['GET', '/admin/users', undefined],
    ['POST', '/admin/users/0xabc/lock', undefined],
    ['POST', '/admin/users/0xabc/unlock', undefined],
    ['GET', '/admin/tasks', undefined],
    ['GET', '/admin/tasks?owner=0xabc', undefined],
    ['GET', '/admin/positions?owner=0xabc', undefined],
    ['GET', '/admin/decisions', undefined],
    ['GET', '/admin/wallets?owner=0xabc', undefined],
    ['GET', '/admin/withdrawals', undefined],
    ['POST', '/admin/tasks/5/enable', undefined],
    ['POST', '/admin/tasks/5/disable', undefined],
    ['GET', '/admin/audit?limit=100', undefined],
    ['GET', '/admin/audit?owner=0xabc&action=withdraw&limit=200', undefined],
    ['PUT', '/settings/kill_switch', { on: true }],
  ])
})
```

`web/src/lib/explorer.test.ts`：
```ts
import { addressUrl, txUrl } from './explorer'

it('returns null without config', () => {
  vi.stubEnv('VITE_EXPLORER_BASE', '')
  vi.stubEnv('VITE_EXPLORER_ADDRESS_BASE', '')
  expect(txUrl('0xh')).toBeNull()
  expect(addressUrl('0xa')).toBeNull()
})

it('joins with or without trailing slash', () => {
  vi.stubEnv('VITE_EXPLORER_BASE', 'https://e/tx/')
  vi.stubEnv('VITE_EXPLORER_ADDRESS_BASE', 'https://e/address')
  expect(txUrl('0xh')).toBe('https://e/tx/0xh')
  expect(addressUrl('0xa')).toBe('https://e/address/0xa')
  vi.unstubAllEnvs()
})
```
（`explorer.ts` 需在每次调用时读 `import.meta.env`，不要模块级缓存，否则 `stubEnv` 不生效。）

`format.test.ts` 追加：
```ts
import { fmtTime } from './format'
it('formats time in local zone and dashes empty', () => {
  expect(fmtTime(null)).toBe('—')
  expect(fmtTime('')).toBe('—')
  expect(fmtTime('2026-09-06T08:41:24.800Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/api src/lib`

- [ ] **Step 3: 实现**

`client.ts`：`requestFull` 加第四个参数 `opts?: { timeoutMs?: number }`；创建 `const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), opts?.timeoutMs ?? REQUEST_TIMEOUT_MS)`；`fetch(..., { signal: ac.signal })`；`catch (e)`：`e` 是 `AbortError`（`e instanceof DOMException && e.name === 'AbortError'` 或 `(e as {name?:string}).name === 'AbortError'`）→ `throw new ApiError(0, '请求超时')`，否则 `无法连接服务`；`finally { clearTimeout(timer) }`。`request` 透传 `opts`。

`positions.ts`/`decisions.ts`/`signals.ts`/`admin.ts` 按 Interfaces；查询串用一个小 helper：
```ts
// api/query.ts
export function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
```
（`URLSearchParams` 会把 `:` 编码为 `%3A`，与测试一致；参数插入顺序即键顺序，测试按 `task, outcome, limit` / `target, since, limit` / `owner, action, limit` 传。）`adminApi.lockUser` 把地址小写后拼路径。

`explorer.ts`：
```ts
function join(base: string | undefined, id: string): string | null {
  if (!base) return null
  return base.endsWith('/') ? base + id : `${base}/${id}`
}
export function txUrl(hash: string) { return join(import.meta.env.VITE_EXPLORER_BASE, hash) }
export function addressUrl(addr: string) { return join(import.meta.env.VITE_EXPLORER_ADDRESS_BASE, addr) }
```
`vite-env.d.ts` 加 `readonly VITE_EXPLORER_ADDRESS_BASE?: string`；`web/.env.example` 加 `VITE_EXPLORER_ADDRESS_BASE=`。

`format.ts`：
```ts
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add web/src/api web/src/lib web/src/vite-env.d.ts web/.env.example
git commit -m "feat(web): 仓位/决策/信号/管理员 API、请求超时、地址链接与时间格式化"
```

---

### Task 2: 仓位页与手动卖出

**Files:**
- Create: `web/src/features/positions/PositionsPage.tsx`、`web/src/features/positions/PositionRow.tsx`、`web/src/features/positions/SellDialog.tsx`、`web/src/features/positions/exitState.ts`
- Modify: `web/src/app/App.tsx`（`/positions`）、`web/src/features/tasks/TaskRow.tsx`（仓位链接带 `?task=`）、`web/src/features/wallets/WalletRow.tsx` 与 `web/src/features/targets/TargetsPage.tsx`（地址用 `addressUrl` 时渲染链接）
- Test: `web/src/features/positions/PositionsPage.test.tsx`、`web/src/features/positions/exitState.test.ts`

**Interfaces:**
```ts
// exitState.ts
export function exitBlockedText(p: Position): string | null   // exit_fail_count>0 → `退出受阻：${last_exit_error}，连续 ${n} 次，下次尝试 ${HH:MM}`（next_exit_at 为空则省略"下次尝试"）
// PositionsPage：读 ?task= 初始选中；任务下拉（useTasks，标签 `目标 缩写 · 钱包`）；useQuery(['positions', taskId], enabled: taskId!=null, refetchInterval 10_000, meta.silent)
// SellDialog({ position, open, onOpenChange, onSold })：滑块 range 1–100（默认 100）→ positionsApi.sell(id, pct*100)（useMutation, meta.silent，ApiError → 行内 alert）；成功显示 `outcome`/`sell_qty`/`quoted_out`，toast.success('已提交卖出')，onSold()
```

- [ ] **Step 1: 写失败测试**

`exitState.test.ts`：
```ts
import { exitBlockedText } from './exitState'
import type { Position } from '@/api/positions'
const base = { id: 1, task_id: 1, token: '0xt', qty: '10', cost_usdg: '0', avg_price_usdg: 0, addon_count: 0, tp_done: false, realized_usdg: '0', virtual: true, updated_at: '' } as Position
it('formats blocked state', () => {
  expect(exitBlockedText({ ...base, exit_fail_count: 0, last_exit_error: '', next_exit_at: null })).toBeNull()
  const s = exitBlockedText({ ...base, exit_fail_count: 3, last_exit_error: 'no_route', next_exit_at: '2026-09-06T04:34:00Z' })
  expect(s).toMatch(/^退出受阻：no_route，连续 3 次，下次尝试 \d{2}:\d{2}$/)
  expect(exitBlockedText({ ...base, exit_fail_count: 1, last_exit_error: 'quote_failed', next_exit_at: null })).toBe('退出受阻：quote_failed，连续 1 次')
})
```

`PositionsPage.test.tsx`：
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/positions', () => ({ positionsApi: { byTask: vi.fn(), sell: vi.fn() } }))

import { ApiError } from '@/api/client'
import { tasksApi } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { positionsApi, type Position } from '@/api/positions'
import { makeQueryClient } from '@/app/queryClient'
import PositionsPage from './PositionsPage'

const pos: Position = { id: 7, task_id: 10, token: '0x3333333333333333333333333333333333333333', qty: '1000', cost_usdg: '10000000', avg_price_usdg: 10000, addon_count: 1, tp_done: false, realized_usdg: '0', virtual: true, updated_at: '', exit_fail_count: 2, last_exit_error: 'reserve_short', next_exit_at: '2026-09-06T04:34:00Z' }

function renderPage(path = '/positions?task=10') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PositionsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasksApi.list).mockResolvedValue([{ id: 10, wallet_id: 1, target_id: 2 } as never])
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([{ id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active', usdg_balance: '0', eth_balance: '0', task_count: 1, has_pending_withdrawal: false, note: '', created_at: '' }])
  vi.mocked(positionsApi.byTask).mockResolvedValue([pos])
})

it('preselects the task from the query string and lists positions with badges and blocked text', async () => {
  renderPage()
  expect(await screen.findByLabelText('任务')).toHaveValue('10')
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  expect(within(row).getByText('dry-run')).toBeInTheDocument()
  expect(within(row).getByText('10')).toBeInTheDocument() // cost 10 USDG
  expect(within(row).getByText(/退出受阻：reserve_short，连续 2 次/)).toBeInTheDocument()
})

it('sells a percentage and shows the result; errors render inline', async () => {
  vi.mocked(positionsApi.sell).mockResolvedValueOnce({ outcome: 'DRY_RUN', reason: 'manual', sell_qty: '500', quoted_out: '4000000' })
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '卖出' }))
  const slider = screen.getByLabelText('卖出比例')
  await userEvent.click(slider) // jsdom 不支持拖动，直接改值
  ;(slider as HTMLInputElement).value = '50'
  slider.dispatchEvent(new Event('input', { bubbles: true }))
  await userEvent.click(screen.getByRole('button', { name: '确认卖出' }))
  expect(positionsApi.sell).toHaveBeenCalledWith(7, 5000)
  expect(await screen.findByText(/DRY_RUN/)).toBeInTheDocument()
  expect(screen.getByText(/500/)).toBeInTheDocument()

  vi.mocked(positionsApi.sell).mockRejectedValueOnce(new ApiError(409, '该仓位已有退出订单在途'))
  await userEvent.click(screen.getByRole('button', { name: '确认卖出' }))
  expect(await screen.findByText('该仓位已有退出订单在途')).toBeInTheDocument()
})
```
（滑块用 `<input type="range" min=1 max=100>` + `aria-label="卖出比例"`，由受控 state 驱动；测试里用原生 `input` 事件改值——若 React 受控 range 在 jsdom 下不响应该事件，改用 `fireEvent.change(slider, { target: { value: '50' } })`，两者任选一种并在测试里写清楚。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/positions`

- [ ] **Step 3: 实现**

- `exitState.ts` 按接口；时间用 `fmtTime` 截取 `HH:MM`（`fmtTime(iso).slice(11, 16)`）。
- `PositionRow`：列 代币（缩写 + 复制 + `addressUrl` 链接）、数量（原始整数字符串，代币精度未知，原样显示）、成本（`unitsToUsdg`）、均价（`avg_price_usdg`，最多 6 位小数）、已实现（`unitsToUsdg`）、加仓次数、状态（`virtual` → `Badge gray 'dry-run'`；`tp_done` → `Badge blue '已止盈'`；`exitBlockedText` → `Badge amber` + 文本）、操作 `卖出`（`qty` 为 `'0'` 时禁用）。
- `PositionsPage`：`useSearchParams` 读 `task`；`useTasks`+`useTargets`+`useWallets` 组任务下拉标签；选中后 `useQuery`；表格 `Table head={['代币','数量','成本 USDG','均价','已实现','加仓','状态','操作']}`；未选任务提示 `请选择任务`；`SellDialog` 成功后失效 `['positions', taskId]` 与 `['tasks']`。
- `SellDialog`：`pct` state（默认 100），`<input type="range" min={1} max={100} aria-label="卖出比例">` + 显示 `{pct}%`，说明 `dry-run 下作用于虚拟仓位`；`useMutation({ mutationFn: (p: number) => positionsApi.sell(position.id, p * 100), meta: { silent: true } })`；结果区显示 `结果 {outcome}（{reason}）· 卖出 {sell_qty} · 预计得到 {unitsToUsdg(quoted_out)} USDG`；`ApiError` → `role="alert"`。
- `TaskRow`：仓位链接改为 `/positions?task=${id}`。`WalletRow`/`TargetsPage`：`const url = addressUrl(addr)`，有则 `<a href target=_blank rel=noreferrer>` 包住缩写地址。
- `App.tsx`：`/positions` → `PositionsPage`；`App.test.tsx` 加 `@/api/positions` mock。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add -A web/src
git commit -m "feat(web): 仓位页（退出受阻提示、dry-run 角标）与手动卖出对话框"
```

---

### Task 3: 决策与信号列表页

**Files:**
- Create: `web/src/features/positions/DecisionsPage.tsx`、`web/src/features/positions/SignalsPage.tsx`、`web/src/features/positions/outcome.ts`
- Modify: `web/src/app/App.tsx`
- Test: `web/src/features/positions/DecisionsPage.test.tsx`、`web/src/features/positions/SignalsPage.test.tsx`、`web/src/features/positions/outcome.test.ts`

**Interfaces:**
```ts
// outcome.ts
export function outcomeTone(o: string): 'green' | 'gray' | 'red' | 'blue'   // DRY_RUN green, SKIPPED gray, FAILED red, else blue
export const OUTCOMES = ['DRY_RUN', 'SKIPPED', 'FAILED', 'EXECUTED'] as const
```
两页共同模式：筛选栏 + 表格 + `加载更多`（`limit` 从 50 起每次 +50，上限 1000，达到上限或返回行数 < limit 时隐藏按钮）；查询 `useQuery({ queryKey: ['decisions', task, outcome, limit], ..., meta: { silent: true }, placeholderData: keepPreviousData })`。

- [ ] **Step 1: 写失败测试**

`outcome.test.ts`：
```ts
import { outcomeTone } from './outcome'
it('maps tones', () => {
  expect(outcomeTone('DRY_RUN')).toBe('green'); expect(outcomeTone('SKIPPED')).toBe('gray'); expect(outcomeTone('FAILED')).toBe('red'); expect(outcomeTone('EXECUTED')).toBe('blue')
})
```

`DecisionsPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/decisions', () => ({ decisionsApi: { list: vi.fn() } }))

import { tasksApi } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { decisionsApi, type Decision } from '@/api/decisions'
import { makeQueryClient } from '@/app/queryClient'
import DecisionsPage from './DecisionsPage'

const d = (id: number, outcome: string, reason = 'x'): Decision => ({ id, signal_id: 1, task_id: 10, side: 'BUY', outcome, reason, planned_amount_in: '10000000', planned_min_out: '0', quoted_out: '420', quoted_price_usdg: 23809.5, t_seen: '2026-09-06T08:41:24Z', t_decided: null, t_quoted: null, error: outcome === 'FAILED' ? 'boom' : '', created_at: '2026-09-06T08:41:24Z' })

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DecisionsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasksApi.list).mockResolvedValue([{ id: 10, wallet_id: 1, target_id: 2 } as never])
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([])
})

it('lists decisions with outcome badges and filters by task/outcome; load more grows the limit', async () => {
  const fifty = Array.from({ length: 50 }, (_, i) => d(i + 1, i % 2 ? 'DRY_RUN' : 'SKIPPED'))
  vi.mocked(decisionsApi.list).mockResolvedValueOnce(fifty).mockResolvedValueOnce([d(99, 'FAILED')]).mockResolvedValue([...fifty, d(51, 'FAILED')])
  renderPage()
  expect(await screen.findAllByText('DRY_RUN')).not.toHaveLength(0)
  expect(decisionsApi.list).toHaveBeenLastCalledWith({ limit: 50 })

  await userEvent.selectOptions(screen.getByLabelText('结果'), 'FAILED')
  await userEvent.selectOptions(screen.getByLabelText('任务'), '10')
  expect(await screen.findByText('boom')).toBeInTheDocument()
  expect(decisionsApi.list).toHaveBeenLastCalledWith({ task: 10, outcome: 'FAILED', limit: 50 })

  await userEvent.selectOptions(screen.getByLabelText('结果'), '')
  await userEvent.selectOptions(screen.getByLabelText('任务'), '')
  await screen.findAllByText('SKIPPED')
  await userEvent.click(screen.getByRole('button', { name: '加载更多' }))
  expect(decisionsApi.list).toHaveBeenLastCalledWith({ limit: 100 })
})
```

`SignalsPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/signals', () => ({ signalsApi: { list: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { signalsApi, type Signal } from '@/api/signals'
import { makeQueryClient } from '@/app/queryClient'
import SignalsPage from './SignalsPage'

const s: Signal = { id: 1, block: 55843185, tx_hash: '0xhash', target_addr: '0x2222222222222222222222222222222222222222', side: 'BUY', token: '0x3333333333333333333333333333333333333333', token_amount: '1000', quote_asset: 'ETH', quote_amount: '10000000000000000', quote_token: '', venue: 'pons_curve', venue_addr: '0xv', target_balance_before: '0', target_balance_after: '1000', fill_price_usdg: 0, seen_at: '2026-09-06T08:41:24Z' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: s.target_addr, label: '大户A', note: '', created_at: '' }])
  vi.mocked(signalsApi.list).mockResolvedValue([s])
})

it('lists signals and filters by target', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SignalsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('55843185')).toBeInTheDocument()
  expect(screen.getByText('BUY')).toBeInTheDocument()
  expect(screen.getByText('0.01 ETH')).toBeInTheDocument()
  expect(screen.getByText('pons_curve')).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('目标'), s.target_addr)
  expect(signalsApi.list).toHaveBeenLastCalledWith({ target: s.target_addr, limit: 50 })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/positions`

- [ ] **Step 3: 实现**

- `DecisionsPage`：筛选 `任务`（`Select`，选项 `''`=全部 + 任务标签）、`结果`（`''`=全部 + `OUTCOMES`）；`limit` state；列：时间（`fmtTime(created_at)`）、方向、结果（`Badge tone=outcomeTone`）、原因、计划买入（`unitsToUsdg(planned_amount_in)`，SELL 时显示 `—`）、报价得到（`quoted_out` 原样）、报价均价（`quoted_price_usdg`）、错误（`error`）。参数对象只放非空项（`task ? Number : undefined`），并用 `decisionsApi.list({ ...(task ? { task } : {}), ...(outcome ? { outcome } : {}), limit })` 保证 `toHaveBeenLastCalledWith` 的形状。
- `SignalsPage`：筛选 `目标`（`''`=全部 + 目标地址，选项值为小写地址，标签 `大户A 0x2222…2222`）；列：时间、块号、目标（缩写）、方向、代币（缩写 + `addressUrl` 链接）、数量（原样）、计价（`quote_asset==='ETH'` → `weiToEth(quote_amount) + ' ETH'`；`USDG` → `unitsToUsdg + ' USDG'`；其他 → `quote_amount + ' ' + quote_asset`）、场所；`加载更多` 同上。
- `App.tsx`：`/decisions`、`/signals`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add -A web/src
git commit -m "feat(web): 决策与信号列表（筛选、结果角标、加载更多）"
```

---

### Task 4: 管理员总览、全局开关与用户管理

**Files:**
- Create: `web/src/features/admin/OverviewPage.tsx`、`web/src/features/admin/UsersPage.tsx`、`web/src/features/admin/useAdmin.ts`
- Modify: `web/src/app/App.tsx`、`web/src/app/Banner.tsx`（无改动则跳过）
- Test: `web/src/features/admin/OverviewPage.test.tsx`、`web/src/features/admin/UsersPage.test.tsx`

**Interfaces:**
```ts
// useAdmin.ts
export const adminKeys = { overview: ['admin', 'overview'] as const, users: ['admin', 'users'] as const, list: (kind: string, owner: string) => ['admin', kind, owner] as const, audit: (owner: string, action: string, limit: number) => ['admin', 'audit', owner, action, limit] as const }
export function useOverview(): UseQueryResult<Overview>     // 10 s, meta.silent
export function useAdminUsers(): UseQueryResult<AdminUser[]> // 10 s, meta.silent
```

- [ ] **Step 1: 写失败测试**

`OverviewPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { overview: vi.fn(), users: vi.fn(), setSetting: vi.fn() } }))
vi.mock('@/api/health', () => ({ healthApi: { get: vi.fn() } }))

import { adminApi, type Overview } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import OverviewPage from './OverviewPage'

const ov: Overview = { targets: 15, tasks: 13, tasks_enabled: 12, positions_open: 4, decisions_today: 77, spent_usdg: '123456789',
  engine: { engine_last_block: 100, node_block: 150, last_signal_at: '2026-09-06T08:41:24Z', kill_switch: false, dry_run: true, stock_tokens: 13, exit_scan_last_at: null, exit_scan_errors: 2, exit_scan_backoff: 1, positions_blocked: 1, goswapevm_error: 'unhealthy' } }

function renderPage() {
  return render(<QueryClientProvider client={makeQueryClient()}><OverviewPage /></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.overview).mockResolvedValue(ov)
  vi.mocked(adminApi.users).mockResolvedValue([{ address: '0xa', locked: false, created_at: '', role: 'admin', wallets: 1, tasks: 1, positions_open: 0 }, { address: '0xb', locked: true, created_at: '', role: 'user', wallets: 0, tasks: 0, positions_open: 0 }])
  vi.mocked(adminApi.setSetting).mockResolvedValue(undefined)
})

it('shows metric cards, engine lag warning and errors', async () => {
  renderPage()
  expect(await screen.findByText('123.456789')).toBeInTheDocument() // 累计花费 USDG
  expect(screen.getByText('2')).toBeInTheDocument() // 用户数（来自用户列表）
  expect(screen.getByText('12 / 13')).toBeInTheDocument() // 运行中 / 任务数
  expect(screen.getByText('100 / 150')).toBeInTheDocument()
  expect(screen.getByText('落后 50 块')).toBeInTheDocument()
  expect(screen.getByText('unhealthy')).toBeInTheDocument()
})

it('toggles kill_switch with confirmation', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('switch', { name: '全局停止' }))
  expect(screen.getByText('确认打开全局停止？所有任务将停止跟单')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '确定' }))
  expect(adminApi.setSetting).toHaveBeenCalledWith('kill_switch', true)
})
```

`UsersPage.test.tsx`：
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { users: vi.fn(), lockUser: vi.fn(), unlockUser: vi.fn() } }))

import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import UsersPage from './UsersPage'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.users).mockResolvedValue([
    { address: '0x8ba1f109551bd432803012645ac136ddd64dba72', locked: false, created_at: '2026-09-06T00:00:00Z', role: 'user', wallets: 2, tasks: 3, positions_open: 1 },
    { address: '0x0000000000000000000000000000000000000001', locked: true, created_at: '', role: 'admin', wallets: 0, tasks: 0, positions_open: 0 },
  ])
  vi.mocked(adminApi.lockUser).mockResolvedValue(undefined)
})

it('lists users, locks with confirmation, links to data page', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/admin/users']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/data" element={<div>数据页</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const row = (await screen.findByText('0x8ba1…ba72')).closest('tr')!
  expect(within(row).getByText('2')).toBeInTheDocument()
  expect(within(row).getByText('正常')).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('button', { name: '锁定' }))
  expect(screen.getByText('锁定后该用户无法登录，已在途的提现不受影响')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '确认锁定' }))
  expect(adminApi.lockUser).toHaveBeenCalledWith('0x8ba1f109551bd432803012645ac136ddd64dba72')
  const row2 = screen.getByText('0x0000…0001').closest('tr')!
  expect(within(row2).getByText('已锁定')).toBeInTheDocument()
  expect(within(row2).getByRole('button', { name: '解锁' })).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('link', { name: '0x8ba1…ba72' }))
  expect(await screen.findByText('数据页')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/admin`

- [ ] **Step 3: 实现**

- `useAdmin.ts` 按接口。
- `OverviewPage`：指标卡 `用户数`（`users.length`）、`任务（运行中 / 总数）` 显示 `12 / 13`、`开仓数`、`今日决策`、`累计花费 USDG`（`unitsToUsdg`）；引擎卡：`引擎块 / 节点块` 显示 `100 / 150`，落后 > 20 块时追加 `Badge amber` 文本 `落后 50 块`；`最近信号`（`fmtTime`）；`退出扫描`（`exit_scan_last_at`、`exit_scan_errors` 次失败、`exit_scan_backoff` 退避）、`受阻仓位`、`股票代币白名单` 数；`node_error`/`goswapevm_error` 有值时红字整行显示。全局开关：两个 `role="switch"`（`aria-label` `全局停止` / `dry-run`，`aria-checked`）点击 → `ConfirmDialog`（title `全局开关`，description 按目标状态选文案：kill_switch 打开 `确认打开全局停止？所有任务将停止跟单`，关闭 `确认关闭全局停止？`，dry_run `确认切换 dry-run？`，confirmText `确定`）→ `adminApi.setSetting` → 失效 overview 与 `['health']`。
- `UsersPage`：表格 地址（`<Link to={`/admin/data?owner=${address}`}>` 显示缩写）、角色、状态（`已锁定` red / `正常` green）、钱包数、任务数、开仓数、最近创建（`fmtTime(created_at)`）、操作（`锁定`/`解锁`，`ConfirmDialog` description 上述文案，confirmText `确认锁定`/`确认解锁`）。
- `App.tsx`：`/admin/overview`、`/admin/users`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add -A web/src
git commit -m "feat(web): 管理员总览（指标、引擎状态、全局开关）与用户管理"
```

---

### Task 5: 管理员全站数据与审计

**Files:**
- Create: `web/src/features/admin/DataPage.tsx`、`web/src/features/admin/AuditPage.tsx`
- Modify: `web/src/app/App.tsx`
- Test: `web/src/features/admin/DataPage.test.tsx`、`web/src/features/admin/AuditPage.test.tsx`

**Interfaces:** `DataPage` 读 `?owner=`（`Input` 可编辑，回车/失焦生效并写回 URL）与 `?tab=tasks|positions|wallets|withdrawals|decisions`（默认 `tasks`）；每个标签一个 `useQuery(adminKeys.list(tab, owner), () => adminApi[tab](owner || undefined), 10 s, meta.silent)`；任务标签行操作 `紧急禁用`/`恢复`（`ConfirmDialog`，confirmText `确认禁用`/`确认恢复`，成功失效该列表）。`AuditPage`：筛选 `用户`（Input）、`动作`（Select，`''`=全部 + 固定列表 `login, logout, action_sign, wallet_create, wallet_export, wallet_delete, withdraw, task_create, task_update, task_enable, task_disable, task_delete, admin_task_disable, admin_task_enable, admin_user_lock, admin_user_unlock, setting_update`）、`limit` 50 起 `加载更多`。

- [ ] **Step 1: 写失败测试**

`DataPage.test.tsx`：
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { tasks: vi.fn(), positions: vi.fn(), wallets: vi.fn(), withdrawals: vi.fn(), decisions: vi.fn(), disableTask: vi.fn(), enableTask: vi.fn() } }))

import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import DataPage from './DataPage'
import { defaultStrategy, toBackend } from '@/features/tasks/strategySchema'

const task = { ...toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }), id: 10, owner: '0xabc', enabled: true, spent_usdg: '0', consecutive_failures: 0, paused_reason: '', paused_at: null }

function renderPage(path = '/admin/data') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DataPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.tasks).mockResolvedValue([task])
  vi.mocked(adminApi.wallets).mockResolvedValue([{ id: 1, owner: '0xabc', address: '0x1111111111111111111111111111111111111111', label: 'w', note: '', status: 'active', created_at: '' } as never])
  vi.mocked(adminApi.disableTask).mockResolvedValue(undefined)
})

it('lists tasks by default, filters by owner from the URL, switches tabs, and emergency-disables', async () => {
  renderPage('/admin/data?owner=0xabc')
  expect(await screen.findByDisplayValue('0xabc')).toBeInTheDocument()
  expect(adminApi.tasks).toHaveBeenLastCalledWith('0xabc')
  const row = (await screen.findByText('0xabc')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '紧急禁用' }))
  await userEvent.click(screen.getByRole('button', { name: '确认禁用' }))
  expect(adminApi.disableTask).toHaveBeenCalledWith(10)

  await userEvent.click(screen.getByRole('tab', { name: '钱包' }))
  expect(await screen.findByText('0x1111…1111')).toBeInTheDocument()
  expect(adminApi.wallets).toHaveBeenLastCalledWith('0xabc')
  expect(screen.queryByText(/wallet_key/)).not.toBeInTheDocument()
})
```

`AuditPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { audit: vi.fn() } }))

import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import AuditPage from './AuditPage'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.audit).mockResolvedValue([{ id: 1, owner: '0xabc', action: 'withdraw', detail: 'asset=USDG amount=1', ip: '1.2.3.4', created_at: '2026-09-06T08:41:24Z' }])
})

it('lists audit rows and filters by action', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuditPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('asset=USDG amount=1')).toBeInTheDocument()
  expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
  expect(adminApi.audit).toHaveBeenLastCalledWith({ limit: 50 })
  await userEvent.selectOptions(screen.getByLabelText('动作'), 'withdraw')
  expect(adminApi.audit).toHaveBeenLastCalledWith({ action: 'withdraw', limit: 50 })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/admin`

- [ ] **Step 3: 实现**

- `DataPage`：标签栏用 `role="tablist"`/`role="tab"` 按钮（`任务`/`仓位`/`钱包`/`提现`/`决策`），选中标签 `aria-selected`；`owner` 输入框（`Field label="按用户过滤" htmlFor="owner"`）；各标签表格：
  - 任务：owner、id、目标 id、钱包 id、状态（同 `TaskRow` 的角标逻辑，复用 `summaryText`？——`TaskRow` 的 `summaryText` 未导出，本任务把它导出为 `taskSummaryText(t)` 并复用）、摘要、操作 `紧急禁用`（enabled）/`恢复`（disabled）。
  - 仓位：owner、任务 id、代币缩写、数量、成本、`dry-run` 角标。
  - 钱包：owner、地址缩写、标签、状态（**不显示密文，也无导出/删除**）。
  - 提现：owner、钱包 id、资产、金额（按资产换算）、状态角标（复用 `withdrawStatus`）、哈希。
  - 决策：时间、owner 无（决策行无 owner）、任务 id、方向、结果角标、原因、错误。
- `AuditPage`：筛选栏（用户 `Input`、动作 `Select`）、表格 时间/用户（缩写）/动作/详情/IP、`加载更多`。
- `App.tsx`：`/admin/data`、`/admin/audit`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add -A web/src
git commit -m "feat(web): 管理员全站数据（五标签、按用户过滤、紧急禁用）与审计日志"
```

---

### Task 6: 端到端冒烟脚本、百分比小数处理、文档

**Files:**
- Create: `scripts/smoke.mjs`（仓库根）
- Modify: `web/src/features/tasks/strategySchema.ts`（数字型百分比最多 2 位小数）、`web/src/features/tasks/strategySchema.test.ts`、`README.md`、`docs/superpowers/specs/2026-09-06-frontend-design.md`（实现修订 计划 C）、`package.json`（根，若无则新建仅含 `"type": "module"` 与 `"scripts": {"smoke": "node scripts/smoke.mjs"}`）
- Test: 冒烟脚本本身不进 vitest；schema 测试追加

- [ ] **Step 1: schema 追加测试**

`strategySchema.test.ts` 追加：
```ts
it('numeric percent fields allow at most two decimals', () => {
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 1.005 }).error?.issues[0].message).toBe('最多 2 位小数')
  expect(strategySchema.safeParse({ ...defaultStrategy, slippage_pct: 1.05 }).success).toBe(true)
  expect(strategySchema.safeParse({ ...defaultStrategy, tp_enabled: true, take_profit_pct: 0.001 }).error?.issues[0].message).toBe('最多 2 位小数')
})
```
实现：在 `superRefine` 里对 `take_profit_pct`、`take_profit_sell_pct`、`stop_loss_pct`、`max_creator_tax_pct`、`max_chase_pct`、`slippage_pct` 各做 `Math.abs(p * 100 - Math.round(p * 100)) > 1e-9` → issue `最多 2 位小数`（path 为该字段）；`take_profit_*`/`stop_loss_pct` 只在 `tp_enabled` 时检查。

- [ ] **Step 2: 冒烟脚本**

`scripts/smoke.mjs`（Node 22，ESM；依赖 `web/node_modules/viem`——脚本里 `import { privateKeyToAccount } from '../web/node_modules/viem/_esm/accounts/index.js'` 不可靠，改为在根 `package.json` 加 `"dependencies": { "viem": "^2.56.0" }` 并 `npm install` 生成根 `package-lock.json`；`.gitignore` 已忽略 `node_modules/`）：
```js
#!/usr/bin/env node
// 端到端冒烟：对着真实 gofollow（经前端反代或直连）用测试私钥完成 SIWE 登录，再走一遍建钱包 → 建目标 → 建任务 → 启停 → 删任务 → 登出。
// 用法：SMOKE_KEY=0x<私钥> BASE=http://127.0.0.1:8080/api node scripts/smoke.mjs
import { privateKeyToAccount } from 'viem/accounts'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080/api'
const KEY = process.env.SMOKE_KEY
if (!KEY) { console.error('缺少 SMOKE_KEY'); process.exit(2) }
const account = privateKeyToAccount(KEY)
let token = ''

async function call(method, path, body, expect = [200]) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} → ${res.status} ${text}`)
  console.log(`✓ ${method} ${path} → ${res.status}`)
  return data
}

const { message } = await call('POST', '/auth/nonce', { address: account.address })
const signature = await account.signMessage({ message })
;({ token } = await call('POST', '/auth/verify', { address: account.address, signature }))
const me = await call('GET', '/auth/me')
console.log('  登录为', me.address, me.role)

const w = await call('POST', '/wallets', { label: `smoke-${Date.now()}`, note: '' })
const tAddr = '0x' + Date.now().toString(16).padStart(40, 'a').slice(-40)
const tg = await call('POST', '/targets', { address: tAddr, label: 'smoke', note: '' })
const task = await call('POST', '/tasks', {
  wallet_id: w.id, target_id: tg.id, size_mode: 'ratio', size_value: '1000', ratio_min_usdg: '0', max_per_trade_usdg: '20000000',
  min_target_trade_usdg: '0', max_target_trade_usdg: '0', spend_limit_usdg: '0', max_addon_per_token: 1, sell_mode: 'proportional',
  take_profit_bps: 0, take_profit_sell_bps: 0, stop_loss_bps: 0, max_hold_sec: 0, follow_curve: true, platforms: ['uniswap'],
  quote_assets: ['USDG'], max_creator_tax_bps: 200, skip_launch_window_sec: 15, max_chase_bps: 1500, token_blacklist: [], slippage_bps: 1000, retry_max: 2,
})
await call('POST', `/tasks/${task.id}/disable`)
await call('POST', `/tasks/${task.id}/enable`)
const tasks = await call('GET', '/tasks')
if (!tasks.some((t) => t.id === task.id && t.enabled)) throw new Error('任务未出现在列表或未启用')
await call('GET', `/tasks/${task.id}/positions`)
await call('GET', '/decisions?limit=5')
await call('DELETE', `/tasks/${task.id}`)
await call('DELETE', `/targets/${tg.id}`)
await call('POST', '/auth/logout')
console.log('冒烟通过（钱包', w.address, '留在库里，可在页面上删除）')
```
（钱包不删：删除需要动作签名，脚本不做；README 说明。）

- [ ] **Step 3: README 与 spec**

README 增加「端到端冒烟」小节：前置（gofollow 与前端服务已起、`SMOKE_KEY` 为一把只用于测试的私钥、若该地址不是管理员且库里有 orphan 数据不影响）；命令 `SMOKE_KEY=0x… BASE=http://127.0.0.1:8080/api node scripts/smoke.mjs`；以及 `VITE_EXPLORER_ADDRESS_BASE` 说明。spec 末尾加 `## 实现修订（2026-09-06，计划 C）`：请求 30 s 超时；地址链接变量；仓位页用 `?task=` 预选；决策/信号"加载更多"用 limit 递增（后端无游标）；管理员数据页标签与 owner 过滤走 URL；冒烟脚本不删钱包；数字型百分比限制 2 位小数。

- [ ] **Step 4: 全部门禁 + 冒烟实跑**

Run: `cd web && npm run typecheck && npm test -- --run && npm run build`；然后在仓库根 `npm install`（根 package.json）并 `SMOKE_KEY=$(node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))") BASE=http://127.0.0.1:8080/api node scripts/smoke.mjs`（本机 gofollow 与前端服务在跑时应全部 ✓；不在跑则记录为未执行）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 端到端冒烟脚本、数字型百分比两位小数校验、文档与 spec 修订"
```

---

## 自查记录

- **Spec 覆盖**：§9 仓位/手动卖出（T2）、决策/信号（T3）；§10 总览/开关/用户（T4）、全站数据/审计（T5）；§13 冒烟（T6）；计划 B/D 留下的请求超时、地址链接（T1/T2）、数字型百分比小数（T6）。
- **占位扫描**：无 TBD。
- **类型一致性**：`positionsApi`/`decisionsApi`/`signalsApi`/`adminApi` 名称与参数在 T1 定义、T2–T5 消费；`outcomeTone` T3 定义、T5 决策标签复用；`taskSummaryText` 在 T5 从 `TaskRow` 导出复用；`fmtTime`/`addressUrl` T1 定义。
- **已知取舍**：决策/信号无游标，加载更多靠 limit 递增（上限 1000）；冒烟脚本不测导出/删除钱包/提现（需要签名或真实资金）。
