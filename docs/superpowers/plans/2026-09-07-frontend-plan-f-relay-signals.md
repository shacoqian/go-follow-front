# go-follow-front 计划 F：代发信号标签与筛选、加仓 0 = 不限 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跟随后端 `eb1c72c`（代发交易 P1）：信号页显示“本人/代发”标签、支持 `via` 筛选并展示发送方；任务表单加仓次数允许 0 = 不限。

**Architecture:** 只动信号 API 类型与信号页、策略 schema/表单；沿用现有筛选栏与 `Badge`。

**Spec:** go-follow `docs/superpowers/specs/2026-09-07-relay-follow-design.md` §5–§6。

## Global Constraints

- 后端契约：`GET /signals` 行新增 `tx_from`（小写地址或空）、`via`（`self|relay`）、`relay_router`（小写或空）；查询参数 `via=self|relay`（其它值 400）。任务 `max_addon_per_token`：0 = 不限，负数 400，缺省 1。
- 文案（verbatim）：标签 `本人`（gray）/`代发`（blue）；筛选标签 `来源`，选项 `全部`、`本人`、`代发`；标签悬停 `title` 为 `发送方 {shortAddress(tx_from)}`（`via=relay`）；加仓次数字段标签改为 `单币加仓次数（0 = 不限）`，校验文案 `不能为负`。
- 测试：`vi.clearAllMocks()`、`MemoryRouter` v7 future 标志、无 act/console 警告；`cd web && npm run typecheck && npm test -- --run && npm run build` 全绿。
- 提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。

---

### Task 1: 信号页来源标签与筛选、加仓 0 = 不限

**Files:**
- Modify: `web/src/api/signals.ts`（`Signal` 加三字段；`list` 参数加 `via?: 'self' | 'relay'`，只在非空时拼入查询串）、`web/src/api/resources2.test.ts`（追加 `via` 用例）、`web/src/features/positions/SignalsPage.tsx`（+ `.test.tsx`）、`web/src/features/tasks/strategySchema.ts`（`max_addon_per_token` 改 `.min(0, '不能为负')`）、`web/src/features/tasks/strategySchema.test.ts`、`web/src/features/tasks/StrategyForm.tsx`（标签与 `min="0"`）、`web/src/features/tasks/StrategyForm.test.tsx`、`docs/superpowers/specs/2026-09-06-frontend-design.md`（实现修订 计划 F）

- [ ] **Step 1: 写失败测试**

`resources2.test.ts` 追加：`signalsApi.list({ via: 'relay', limit: 50 })` → `'/signals?via=relay&limit=50'`（参数顺序 target, since, via, limit）。
`SignalsPage.test.tsx`：fixture 两条信号，一条 `via: 'self'`、一条 `via: 'relay', tx_from: '0x1cd9d560440aab96f7b0a007ced7c2191cac5baf'`；断言行内出现 `本人` 与 `代发`，`代发` 标签 `title` 为 `发送方 0x1cd9…5baf`；选择 `来源` = `代发` 后 `signalsApi.list` 最后一次调用含 `via: 'relay'`；选回 `全部` 后不含 `via`。
`strategySchema.test.ts`：`max_addon_per_token: 0` 通过且 `toBackend` 发 0；`-1` 报 `不能为负`。
`StrategyForm.test.tsx`：标签文本 `单币加仓次数（0 = 不限）`，`min` 属性 `0`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/api src/features/positions/SignalsPage.test.tsx src/features/tasks`

- [ ] **Step 3: 实现**

- `signals.ts`：类型与 `list`。
- `SignalsPage.tsx`：筛选栏加 `来源` `Select`（`''`/`self`/`relay`），加入 `queryKey`；表格“目标”列旁加 `Badge`（`self` gray `本人`、`relay` blue `代发` + `title`）；`加载更多` 逻辑不变。
- `strategySchema.ts`：`.min(0, '不能为负')`，默认值仍 1；`StrategyForm.tsx` 标签与 `min="0"`。
- spec 末尾 `## 实现修订（2026-09-07，计划 F）`：来源标签/筛选、加仓 0 = 不限；依赖 go-follow ≥ eb1c72c。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run && npm run build`

- [ ] **Step 5: 提交**

```bash
git add -A web/src docs
git commit -m "feat(web): 信号页来源标签与筛选，加仓次数 0 = 不限"
```

## 自查记录

- Spec 覆盖：后端 spec §6 前端条目全部（标签、筛选、加仓提示）。占位：无。类型：`via` 字面量类型与后端一致。
