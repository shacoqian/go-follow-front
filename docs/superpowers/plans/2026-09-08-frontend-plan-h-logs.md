# go-follow-front 计划 H：管理员日志页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可在页面上检索后端日志（后端 go-follow `ed677b6` 的 `GET /admin/logs`）。

**Spec:** go-follow `docs/2026-09-02-需求讨论记录.md` §18；README「日志」章节。

## Global Constraints

- 契约：`GET /admin/logs?q=&level=&from=&to=&limit=&dedup=` → `{total: number, files: string[], entries: Record<string, unknown>[]}`；`entries` 最新在前，每条至少有 `level`(`INFO|WARN|ERROR|DEBUG` 或小写)、`ts`(ISO8601)、`msg`、`module`、`caller`，其余字段任意；400 文案 `limit 须在 1–500`、`from/to 须为 RFC3339`、`level 非法`；503 `日志检索未配置`。
- 文案（verbatim）：导航（管理员组，审计之后）`日志`；页面标题 `日志`；筛选 `关键字`（占位 `逗号分隔，多个关键字同时满足`）、`级别`（`全部/DEBUG/INFO/WARN/ERROR`）、`开始时间`、`结束时间`（`datetime-local`，提交时转 RFC3339 带本地时区）、`条数`（默认 100，1–500）、`去重字段`（可选）；按钮 `查询`；结果头 `共 {total} 条，扫描 {files.length} 个文件`（`total` 上有 `title`：`按文件尾部有限扫描的匹配数`）；空结果 `没有匹配的日志`；级别角标 `ERROR` red、`WARN` amber、`INFO` gray、`DEBUG` gray；行点击展开显示除 `ts/level/module/msg/caller` 之外的字段（键值列表，值为对象时 `JSON.stringify`）。
- 不轮询；查询由按钮触发（`enabled: false` 的 `useQuery` + `refetch`，或 `useMutation` 二选一，统一用 `useQuery` 加 `enabled` 开关）；错误行内 `role="alert"`（`meta.silent`）。
- 测试：`vi.clearAllMocks()`、`MemoryRouter` v7 future 标志、无 act/console 警告；`cd web && npm run typecheck && npm test -- --run && npm run build` 全绿。
- 提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。

### Task 1: 日志页

**Files:**
- Create: `web/src/features/admin/LogsPage.tsx`、`web/src/features/admin/LogsPage.test.tsx`
- Modify: `web/src/api/admin.ts`（`logs(p: {q?, level?, from?, to?, limit, dedup?}) → LogSearchResult`，只拼非空参数，顺序 q, level, from, to, limit, dedup）、`web/src/api/resources2.test.ts`、`web/src/app/App.tsx`（`/admin/logs` 在 `RequireAdmin` 下）、`web/src/app/Shell.tsx`（`adminNav` 审计后加 `日志`）、`web/src/app/App.test.tsx`、`README.md`、`docs/superpowers/specs/2026-09-06-frontend-design.md`（实现修订 计划 H）

- [ ] Step 1 测试：调用形状（`/admin/logs?q=a%2Cb&level=WARN&limit=100`）；页面：初始不请求；填关键字+级别点查询 → `adminApi.logs` 以对应参数调用，表格显示 `msg`/`module`/角标/时间；点击行展开显示额外字段；`total`/文件数头部；空结果文案；400 `limit 须在 1–500` 行内显示；非管理员看不到导航与路由。
- [ ] Step 2–4 实现与门禁（含 `npm run build`）。
- [ ] Step 5 提交 `feat(web): 管理员日志检索页`
