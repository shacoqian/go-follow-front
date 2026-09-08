# go-follow-front 计划 G：实盘配套（operator 管理、决策成交、仓位在途） 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跟随后端 `a24b2f5`（实盘执行 P3）：管理员 operator 钱包页；决策列表显示新状态与成交字段；仓位页在途/dry-run 遗留标签；总览显示可用 operator 数与执行状态；结果角标覆盖新 outcome/reason。

**Architecture:** 新功能片 `features/admin/OperatorsPage`（列表 + 生成/启停/删除/提回，全部 `useMutation`，确认对话框复用 `ConfirmDialog`）；决策/仓位/总览在现有页面上加字段；`outcome.ts` 扩展色板。

**Spec:** go-follow `docs/superpowers/specs/2026-09-07-real-execution-p3-design.md` §6–§7；README「实盘执行」章节。

## Global Constraints

- 后端契约（管理员）：`GET /admin/operators` → `[{id, address, label, enabled, registered, in_flight, removed, removed_reason, created_at, eth_balance(wei 串)}]`；`POST /admin/operators` → `{id, address}`；`POST /admin/operators/:id/enable|disable` → `{ok, id, enabled}`（enable 未登记 → 409 `尚未在链上登记为 operator`）；`DELETE /admin/operators/:id[?force=1]` → 409 文案 `请先停用该 operator` / `仍有在途交易` / `链上登记状态未知，请稍后重试或带 force=1` / `请先在掌钥机撤销登记` / `钱包仍有余额，请先提回`；`POST /admin/operators/:id/withdraw {"amount":"<wei>"|"all"}`（ETH 提到管理员登录地址）；`GET /exec/status` → `{operators_ready, allowance_cache_entries, daily_spent:[{wallet_id, spent_usdg}]}`；`GET /admin/overview.engine.operators_ready`。
- 决策行新增 `tx_id, tx_hash, filled_in, filled_out, gas_used`；outcome 新增 `PENDING, SENT, EXECUTED`；reason 新增 `capped, daily_cap, insufficient_balance, insufficient_gas, approving, build_failed, no_operator`（`capped` 出现在成功的买入决策上，表示被单笔上限截断）。手动卖出实盘返回 `{outcome:"SENT", tx_id}`。
- 文案（verbatim）：导航（管理员组）`Operator`；页面标题 `Operator 钱包`；说明 `签所有跟单交易、只付 gas；生成后需在掌钥机登记再启用`；按钮 `生成`、`启用`、`停用`、`删除`、`提回 ETH`；状态标签 `已登记`(green) / `未登记`(amber) / `已启用`(blue) / `已停用`(gray) / `已摘除：{removed_reason}`(red)；删除确认 `删除后私钥无法找回，请确认已提回 ETH 并在掌钥机撤销登记`；强制删除按钮 `强制删除`；提回对话框标题 `提回 ETH`，金额输入（ETH，`全部` 复选）；结果角标：`EXECUTED` green、`SENT`/`PENDING` blue、`DRY_RUN` green、`SKIPPED` gray、`FAILED` red；仓位页在途标签 `在途`(blue)，dry-run 遗留标签 `dry-run 遗留`(amber，实盘模式下 `virtual=true` 的仓位）；总览指标 `可用 operator`。
- 写操作 `useMutation`；行内错误用 `meta:{silent:true}` + `role="alert"`；列表 10 s 轮询；`vi.clearAllMocks()`、`MemoryRouter` v7 future 标志、无 act/console 警告；`cd web && npm run typecheck && npm test -- --run && npm run build` 全绿。
- 提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。

---

### Task 1: API 层与决策/仓位/总览字段

**Files:**
- Modify: `web/src/api/admin.ts`（`Overview.engine.operators_ready`；新增 `operators()`, `createOperator()`, `setOperatorEnabled(id, on)`, `deleteOperator(id, force)`, `operatorWithdraw(id, amount)`, `execStatus()` 与类型 `Operator`, `ExecStatus`）、`web/src/api/decisions.ts`（`Decision` 加五个字段，`tx_id: number|null`, `tx_hash: string`）、`web/src/api/positions.ts`（`SellResult` 允许 `outcome:'SENT'` 且 `tx_id?`）、`web/src/api/resources2.test.ts`、`web/src/features/positions/outcome.ts`（+test：`EXECUTED` green，`SENT`/`PENDING` blue）、`web/src/features/positions/DecisionsPage.tsx`（列加 `成交`（`filled_in/filled_out` 按方向换算：买入显示 `花 x USDG 得 y`；卖出反之）、`交易`（`tx_hash` 缩写 + `txUrl` 链接）、`gas`；`OUTCOMES` 筛选加三项；`capped` 原因显示 `已截断`）、`web/src/features/positions/PositionRow.tsx`（`在途` 标签：该任务/代币最近决策 outcome 为 `PENDING|SENT`——通过 `useQuery(['decisions', task])` 取最近 50 条判断；`virtual` 且 `health.dry_run=false` 时标 `dry-run 遗留`）、`web/src/features/admin/OverviewPage.tsx`（指标卡 `可用 operator`）、`web/src/features/positions/SellDialog.tsx`（结果 `SENT` 时显示 `已广播，等待回执` + tx_id）、对应测试与 `App.test.tsx` mocks

- [ ] **Step 1: 写失败测试** — `resources2.test.ts` 六个 operator/exec 调用形状；`outcome.test.ts` 新色；`DecisionsPage.test.tsx` fixture 带 `EXECUTED` 行显示成交与哈希链接；`PositionsPage.test.tsx` 在途与遗留标签；`OverviewPage.test.tsx` `可用 operator`；`SellDialog` SENT 文案。
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**
- [ ] **Step 4: 门禁**：`cd web && npm run typecheck && npm test -- --run`
- [ ] **Step 5: 提交** `feat(web): 决策成交字段与新状态、仓位在途/遗留标签、总览可用 operator`

---

### Task 2: Operator 钱包管理页

**Files:**
- Create: `web/src/features/admin/OperatorsPage.tsx`、`web/src/features/admin/OperatorsPage.test.tsx`、`web/src/features/admin/OperatorWithdrawDialog.tsx`
- Modify: `web/src/app/App.tsx`（`/admin/operators` 在 `RequireAdmin` 下）、`web/src/app/Shell.tsx`（`adminNav` 加 `{ to: '/admin/operators', label: 'Operator' }`）、`web/src/app/App.test.tsx`、`README.md`、`docs/superpowers/specs/2026-09-06-frontend-design.md`（实现修订 计划 G）

**页面**：说明文案；`生成` 按钮 → 成功后 toast `已生成 {shortAddress}`，列表刷新；表格列 地址(可复制 + `addressUrl` 链接)/ETH 余额(`weiToEth`)/登记/状态/在途/操作；操作按状态：未登记只有 `删除`；已登记未启用 `启用`、`删除`、`提回 ETH`；已启用 `停用`、`提回 ETH`；已摘除（`removed`，与 `enabled` 是后端两个独立字段，可能同时为真）显示原因，且 `removed && enabled` 只给 `启用`（恢复）+ `停用`，`removed && !enabled` 只给 `启用` + `删除`——两种摘除态都不给 `提回 ETH`。`删除` 走 `ConfirmDialog`，409 时把后端文案行内显示；`DELETE /admin/operators/:id` 共六种 409 文案，`请先停用该 operator`、`仍有在途交易` 在后端读 `force` 参数之前就返回，只显示文案、不出现 `强制删除`；`链上登记状态未知，请稍后重试或带 force=1`、`请先在掌钥机撤销登记`、`余额未知`、`钱包仍有余额，请先提回` 这四种都在 `!force` 分支里，才出现 `强制删除` 按钮（点击带 `force=1` 重试）。`提回 ETH` 对话框：金额或全部 → `operatorWithdraw`，成功 toast `已提交提回`。页面顶部显示 `GET /exec/status` 的 `可用 operator {n}`、`授权缓存 {n}`。

- [ ] **Step 1: 写失败测试** — 列表渲染四种状态；生成调 `createOperator` 并 toast；启用 409 行内显示 `尚未在链上登记为 operator`；删除 409 显示文案且出现 `强制删除`，点后以 `force=true` 调用；提回全部以 `'all'` 调用；非管理员访问 `/admin/operators` 被 `RequireAdmin` 挡（App 测试）。
- [ ] **Step 2–4** 同上（最后 `npm run build`）
- [ ] **Step 5: 提交** `feat(web): Operator 钱包管理页（生成/启停/删除/提回）`

## 自查记录
- 覆盖后端 spec §6 全部接口与 §7 前端条目；文案 verbatim；无 TBD；类型在 T1 定义、T2 消费。
