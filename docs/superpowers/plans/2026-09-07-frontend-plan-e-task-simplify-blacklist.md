# go-follow-front 计划 E：任务策略精简与用户黑名单页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跟随后端 `52dd39d`（迁移 5）：策略表单删掉总额度、场所、计价币、跟内盘、创建者税上限、发射后跳过、黑名单七项；任务列表与管理员任务标签同步；新增“黑名单”页维护用户级黑名单；冒烟脚本请求体同步。

**Architecture:** 先收口任务模型（`api/tasks.ts`、`strategySchema.ts`、表单、行摘要），再加独立的黑名单功能片（`api/blacklist.ts` + `features/blacklist/`），路由与导航各加一项。

**Tech Stack:** 计划 A–D 的栈（React 18、TanStack Query 5、react-hook-form、zod 4、vitest）。

**Spec:** `docs/2026-09-06-需求讨论记录.md` §6；后端 spec `go-follow/docs/superpowers/specs/2026-09-07-task-simplify-user-blacklist-design.md` §4、§8。

## Global Constraints

- 后端契约（go-follow `52dd39d`）：任务请求/响应不再有 `spend_limit_usdg`、`follow_curve`、`platforms`、`quote_assets`、`max_creator_tax_bps`、`skip_launch_window_sec`、`token_blacklist`；带了任一即 400 `字段已废弃: <key>`。`spent_usdg` 保留（累计买入）。`GET /settings/blacklist` → `{tokens: string[]}`；`PUT /settings/blacklist {tokens}` → 200 `{tokens, warning?}`（`tokens` 必填；非法地址 400 `非法地址: <值>`；上限 500）。
- 文案（verbatim）：导航 `黑名单`；页面标题 `黑名单`；说明 `每行一个代币地址，对你的所有跟单任务生效，只拦买入`；按钮 `保存`；成功 toast `黑名单已保存`；有 `warning` 时 toast.error 显示后端 `warning` 原文；行内校验 `第 {n} 行不是合法地址`、`最多 500 条`；任务行“累计买入 {x} USDG”；追价上限提示 `含 STOCK 计价信号建议放宽 0.5–1 个百分点`。
- 查询/写入约定同前：读用 `useQuery`（黑名单页不轮询），写用 `useMutation`；保存失败的 `ApiError` 行内 `role="alert"` 显示（`meta: { silent: true }`）。
- 测试：`vi.clearAllMocks()`、`MemoryRouter` v7 future 标志、无 act/console 警告；每任务 `cd web && npm run typecheck && npm test -- --run` 全绿，最后 `npm run build`。**不要对着本机后端跑冒烟**（本机后端仍是迁移 4 版本，两边一起上线后再跑）。
- 提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。

---

### Task 1: 任务模型收口——schema、表单、行摘要、冒烟脚本

**Files:**
- Modify: `web/src/api/tasks.ts`、`web/src/features/tasks/strategySchema.ts`（+ `.test.ts`）、`web/src/features/tasks/StrategyForm.tsx`（+ `.test.tsx`）、`web/src/features/tasks/TaskRow.tsx`、`web/src/features/tasks/TasksPage.test.tsx`、`web/src/features/admin/DataPage.tsx`（若直接引用旧字段）、`web/src/app/App.test.tsx` 等含任务 fixture 的测试、`scripts/smoke.mjs`

**Interfaces:**
```ts
// api/tasks.ts TaskInput：删七个字段；Task 仍含 spent_usdg
// strategySchema.ts：StrategyValues 删 spend_limit, platforms, quote_assets, follow_curve, max_creator_tax_pct, skip_launch_window_sec, token_blacklist；
//   删 parseBlacklist、PLATFORMS/QUOTE_ASSETS 常量（若在此文件）；toBackend/fromBackend 同步；defaultStrategy 同步
// TaskRow.tsx：删"已花 / 上限"与进度条，改为一行 `累计买入 {unitsToUsdg(spent_usdg)} USDG`
```

- [ ] **Step 1: 写失败测试**

`strategySchema.test.ts`：
```ts
it('toBackend no longer emits removed fields', () => {
  const body = toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }) as Record<string, unknown>
  for (const k of ['spend_limit_usdg', 'follow_curve', 'platforms', 'quote_assets', 'max_creator_tax_bps', 'skip_launch_window_sec', 'token_blacklist']) {
    expect(body).not.toHaveProperty(k)
  }
})
it('fromBackend tolerates tasks without removed fields', () => {
  const t = { ...toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }), id: 1, owner: '0xabc', enabled: true, spent_usdg: '0', consecutive_failures: 0, paused_reason: '', paused_at: null } as Task
  expect(() => fromBackend(t)).not.toThrow()
})
```
`StrategyForm.test.tsx`：断言页面上不存在 `总额度`、`场所`、`计价币`、`跟内盘`、`创建者税上限`、`发射后跳过`、`黑名单地址` 这些标签（`queryByText`/`queryByLabelText` 为 null），存在 `追价上限（%）` 与提示文本 `含 STOCK 计价信号建议放宽 0.5–1 个百分点`。
`TasksPage.test.tsx`：任务行显示 `累计买入 35 USDG`（fixture `spent_usdg: '35000000'`），不再显示 ` / ` 上限。
删掉/改写所有针对旧字段的用例（黑名单校验、场所至少选一、计价币等）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/tasks`

- [ ] **Step 3: 实现**

- `api/tasks.ts`：`TaskInput` 删七字段。
- `strategySchema.ts`：schema 删七字段及其 `superRefine` 分支（黑名单地址校验、创建者税小数校验）；`defaultStrategy`、`toBackend`、`fromBackend` 同步；删 `parseBlacklist`、`isAddress` 导入（若无其它用处）。
- `StrategyForm.tsx`：删“总额度”字段、“过滤”分组里的场所/计价币/跟内盘/创建者税/发射后跳过/黑名单；追价上限字段下加一行灰字提示（verbatim）。分组标题若因此只剩追价与滑点，改名为 `风险控制`（含 追价上限、滑点、重试次数、目标买入过滤保持原分组）。
- `TaskRow.tsx`：删 `limitUnlimited`/`spentPct`/进度条，改为 `累计买入 {unitsToUsdg(t.spent_usdg)} USDG`。`taskSummaryText` 若含总额度/场所描述一并删。
- `DataPage.tsx` 任务标签若直接引用旧字段则同步（它复用 `taskSummaryText`，通常无需改）。
- `scripts/smoke.mjs`：任务请求体删七个键。
- 其它测试 fixture（`App.test.tsx`、`DataPage.test.tsx` 等）用 `toBackend(defaultStrategy, …)` 生成的，自动收口；手写的删字段。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run`

- [ ] **Step 5: 提交**

```bash
git add -A web/src scripts
git commit -m "feat(web): 策略表单删除总额度/场所/计价币/内盘/创建者税/发射窗口/黑名单，任务行显示累计买入"
```

---

### Task 2: 黑名单页、导航与文档

**Files:**
- Create: `web/src/api/blacklist.ts`、`web/src/features/blacklist/BlacklistPage.tsx`、`web/src/features/blacklist/BlacklistPage.test.tsx`、`web/src/features/blacklist/parse.ts`（+ `.test.ts`）
- Modify: `web/src/app/App.tsx`（`/blacklist`）、`web/src/app/Shell.tsx`（`userNav` 在“跟单”之后加 `{ to: '/blacklist', label: '黑名单' }`）、`web/src/app/App.test.tsx`（mock `@/api/blacklist`）、`web/src/api/resources2.test.ts`（追加）、`README.md`、`docs/superpowers/specs/2026-09-06-frontend-design.md`（实现修订 计划 E）

**Interfaces:**
```ts
// api/blacklist.ts
export interface BlacklistResult { tokens: string[]; warning?: string }
export const blacklistApi = { get(): Promise<BlacklistResult>; put(tokens: string[]): Promise<BlacklistResult> }  // GET/PUT /settings/blacklist
// features/blacklist/parse.ts
export function parseBlacklistText(text: string): { tokens: string[]; error: string | null }
//  按行拆分、trim、忽略空行；非法地址 → error `第 {n} 行不是合法地址`（n 为原始行号）；超过 500 → `最多 500 条`；合法则 getAddress 规范化后小写去重
```

- [ ] **Step 1: 写失败测试**

`parse.test.ts`：
```ts
import { parseBlacklistText } from './parse'
const A = '0x1111111111111111111111111111111111111111'
it('parses, dedups (case-insensitive), skips blank lines', () => {
  expect(parseBlacklistText(`${A}\n\n${A.toUpperCase().replace('0X', '0x')}\n`)).toEqual({ tokens: [A], error: null })
})
it('reports the original line number of an invalid address', () => {
  expect(parseBlacklistText(`${A}\n\nnope`).error).toBe('第 3 行不是合法地址')
})
it('caps at 500', () => {
  const many = Array.from({ length: 501 }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0')).join('\n')
  expect(parseBlacklistText(many).error).toBe('最多 500 条')
})
```
`resources2.test.ts` 追加：`blacklistApi.get()` → `['GET','/settings/blacklist', undefined]`；`put(['0xa'])` → `['PUT','/settings/blacklist',{tokens:['0xa']}]`。
`BlacklistPage.test.tsx`：
```tsx
vi.mock('@/api/blacklist', () => ({ blacklistApi: { get: vi.fn(), put: vi.fn() } }))
// 渲染（QueryClientProvider + MemoryRouter + <Toaster/>）：
// 1) 加载后 textarea 显示两行现有地址；
// 2) 改成含非法行 → 点 保存 → 行内 alert `第 2 行不是合法地址`，put 未调用；
// 3) 改成合法两行（含重复大小写）→ 保存 → put 以去重小写数组调用，toast `黑名单已保存`；
// 4) put 返回 { tokens, warning: '引擎黑名单缓存未刷新，请重试' } → toast.error 显示该原文；
// 5) put 抛 ApiError(400,'非法地址: 0xzz') → 行内 alert 显示该文案。
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/blacklist src/api`

- [ ] **Step 3: 实现**

- `api/blacklist.ts` 按接口；`parse.ts` 用 viem `isAddress`/`getAddress`。
- `BlacklistPage`：`useQuery(['blacklist'])`（不轮询）→ 初始化 textarea（受控 state，仅在首次数据到达时填充）；`保存` → `parseBlacklistText` 失败则行内 alert；成功则 `useMutation({ mutationFn: (tokens) => blacklistApi.put(tokens), meta: { silent: true } })`，成功后 `setQueryData(['blacklist'], result)`、`toast.success('黑名单已保存')`，`result.warning` 时 `toast.error(result.warning)`；`ApiError` 行内 alert。页面顶部说明文案 verbatim；显示当前条数 `共 {n} 条`。
- `App.tsx` 路由、`Shell.tsx` 导航、`App.test.tsx` mock。
- README：任务字段段落同步（删掉七项的描述，加黑名单页说明）；spec 末尾 `## 实现修订（2026-09-07，计划 E）`：删除七项、黑名单页、冒烟脚本改动、上线顺序（后端与前端一起重启）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run && npm run build`

- [ ] **Step 5: 提交**

```bash
git add -A web/src README.md docs
git commit -m "feat(web): 用户级黑名单页与导航，文档与 spec 修订"
```

---

## 自查记录

- **Spec 覆盖**：§6 条 1–4 前端部分（T1 删字段与摘要、T2 黑名单页）；后端 spec §8（T1 追价提示、冒烟脚本；T2 黑名单入口）。
- **占位扫描**：无 TBD。
- **类型一致性**：`blacklistApi.get/put` 与 `BlacklistResult`（T2 内定义与消费）；`parseBlacklistText` 返回形状在测试与页面一致。
- **上线顺序**：本计划合并后，go-follow 后端用 `bin/gofollow`（52dd39d）重启，前端 `./app.sh build && ./app.sh restart`，再跑 `scripts/smoke.mjs`。
