# go-follow 前端 设计（go-follow-front）

日期：2026-09-06。需求来源：`docs/2026-09-06-需求讨论记录.md`（本仓库）与 go-follow 仓库 `docs/2026-09-02-需求讨论记录.md` §11。

## 1. 目标与范围

给 go-follow（链上跟单服务，多用户后端已就绪）做一个独立部署的 Web 前端：OKX 钱包签名登录，用户管理自己的跟单钱包、目标地址、跟单任务、仓位与提现；管理员有全站只读总览与少量控制。

做：登录/会话、钱包池（创建、备注、禁用、导出密文、删除、提现）、目标地址、跟单任务三步向导与策略表单、仓位/手动卖出、决策与信号列表、提现历史、管理员总览/用户/全站数据/审计/全局开关、自带 Go 托管服务、测试。

不做（第一版）：多页签、暗色主题、移动端适配（只保证桌面宽度可用）、i18n（只有中文）、HTTPS（由后续接入）、非 OKX 钱包、WalletConnect、私钥导入。

## 2. 技术栈与仓库结构

- React 18 + Vite 5 + TypeScript 5 + Tailwind 3；TanStack Query 5 管服务端数据；zustand 5 管会话等少量客户端状态；react-router 6 路由；viem 2 只用于地址校验与签名相关编码；shadcn/ui（Radix 组件源码拷入仓库）；react-hook-form + zod 做表单。
- 只支持 OKX 钱包：`window.okxwallet`（EIP-1193），连接与签名封装照搬 bridge-exchange 的 `wallets/okx.ts` 写法。
- Node 22 做构建；Go 1.22+ 做托管服务。

```
go-follow-front/
  web/                    React 应用（Vite 项目根）
    src/
      api/                fetch 封装 + 每个接口的类型化函数 + 类型定义
      wallets/okx.ts      OKX 连接、personal_sign
      features/
        auth/             登录页、会话 store、signAction
        wallets/          钱包池页、创建/导出/删除/提现对话框
        targets/          目标地址页
        tasks/            任务列表、三步向导（已由计划 D 的单页 TaskBasicsCard + TaskFormPage 取代，见文末修订）、策略表单（zod schema）
        positions/        仓位页、手动卖出、决策列表、信号列表
        admin/            总览、用户、全站数据、审计
      app/                应用壳（左侧导航、顶部横幅、路由表、守卫）
      lib/                金额/bps/时间格式化与换算
  server/                 Go 托管服务（main.go、proxy.go、static.go、*_test.go）
  docs/                   需求记录、specs、plans
  app.sh                  build | start | stop | status
  Makefile                build = npm ci && npm run build && go build -o bin/gofollow-front ./server
  go.mod                  module gofollowfront
```

## 3. 登录与会话

- 登录页：按钮“连接 OKX 钱包”。未检测到 `window.okxwallet` 显示安装引导链接（OKX 官网）。
- 流程：`eth_requestAccounts` → `POST /api/auth/nonce {address}` 得 `message` → `personal_sign(message, address)` → `POST /api/auth/verify {address, signature}` 得 `{token, address, role, expires_at}`。
- 会话：`{token, address, role, expiresAt}` 放 zustand 并持久化到 `localStorage["gofollow.session"]`；所有请求带 `Authorization: Bearer <token>`。应用启动先调 `GET /api/auth/me` 校验并刷新 `role`；失败按下面的错误处理清会话。
- 登出：`POST /api/auth/logout` 后清本地会话（后端失败也清）。
- 切换账号：监听 OKX `accountsChanged`，新地址与会话地址不同即登出并回登录页。
- 角色：`role=admin` 时导航显示“管理”分组；非管理员不显示入口（后端另有拦截）。
- 动作签名：`signAction(action, params): Promise<string>` = `POST /api/auth/action {action, params}` 得 `message` → `personal_sign` → 返回签名 hex。每次操作重新签，不缓存（后端 409 也会消耗挑战）。
- 路由守卫：未登录访问受保护路由 → 跳登录页并记住来路；登录后跳回。

## 4. API 层与错误处理

- `api/client.ts`：`request<T>(method, path, body?, opts?)`，基址 `/api`，自动带 token、JSON 编解码。
- 状态码映射为 `ApiError {status, message}`：
  - 401 → 清会话、跳登录（一次性，避免并发请求重复跳）；
  - 403 → `message` 显示（“账号已被管理员锁定”），停在登录页；
  - 404 → “资源不存在或无权访问”；
  - 409 / 400 → 后端 `error` 原文；
  - 429 → “操作过于频繁，请稍后再试”；
  - 5xx → 后端 `error`（固定“内部错误”）；网络错误 → “无法连接服务”。
- 除表单内联错误外，错误统一用 toast 显示；调用方可按 `status` 与 `message` 分支（如删除钱包的 409 分类）。
- 每个后端接口一个函数，类型来自 `api/types.ts`。金额字段后端是十进制字符串（最小单位），类型为 `string`，只在展示/输入边界换算。

## 5. 应用壳与刷新策略

- 左侧导航：钱包、目标、跟单、仓位、决策、信号；管理员多一组：总览、用户、全站数据、审计。顶部右侧显示登录地址（缩写）与登出。
- 全局横幅：`GET /api/health` 每 10 秒轮询；`kill_switch=true` 显示红色“已全局停止跟单”，`dry_run=true` 显示黄色“模拟运行中（dry-run）”。
- TanStack Query：钱包/任务/仓位/目标列表 `refetchInterval=10s`；提现单笔状态 3 s；总览 10 s；窗口聚焦即刷新；写操作成功后使相关查询失效。

## 6. 钱包池

- 列表 `GET /api/wallets`：`id, address, label, note, status, usdg_balance, eth_balance, balance_error, task_count, has_pending_withdrawal, created_at`。列：标签、地址（缩写 + 复制）、USDG、ETH、任务数、状态、在途提现标记。`balance_error` 非空时余额列显示“读取失败”。
- 创建：对话框填 `label`、`note` → `POST /api/wallets` → 显示新地址并提示转入 USDG（跟单资金）与少量 ETH（gas）。无导入入口。
- 备注：行内编辑 → `PUT /api/wallets/:id {label, note}`。禁用：确认后 `POST /api/wallets/:id/disable`。
- 导出：对话框说明“导出的是数据库里的加密密文，不能直接导入钱包，需要服务端 `WALLET_STORE_KEY` 解密” → `signAction("export_wallet", {wallet_id})` → `GET /api/wallets/:id/export?action_signature=` → `{address, wallet_key}` 显示在只读文本框，带复制按钮；不生成下载文件；429 提示“每分钟最多导出 3 次”。
- 删除：对话框列出前置条件（无任务引用、无在途提现、余额 ≤ 0.01 USDG 且 ≤ 0.0001 ETH），勾选“我知道删除不可恢复”后 `signAction("delete_wallet", {wallet_id, force:"0"})` → `DELETE /api/wallets/:id?action_signature=&force=0`。409 分支：
  - `钱包仍被任务引用` → 列出 `task_ids`，链接到任务页；
  - `提现进行中` → 提示等待完成；
  - `余额未知` → 提示稍后重试；
  - `钱包忙，请稍后重试` → 提示稍后重试；
  - `钱包仍有余额` → 显示 `usdg`/`eth`，提供“仍然删除”按钮，点击重新 `signAction(..., {wallet_id, force:"1"})` 后带 `force=1` 再删。
- 提现入口：行内“提现”按钮 → §9 对话框。钱包详情抽屉里显示提现历史。

## 7. 目标地址

- 列表 `GET /api/targets`：地址（链接到浏览器）、标签、备注、引用任务数（前端按任务列表统计）。
- 新增 `POST /api/targets {address, label, note}`，地址用 viem `isAddress` 校验；编辑 `PUT`；删除 `DELETE`，409 时提示“先删除引用该目标的任务”。

## 8. 跟单任务

### 8.1 三步向导（新建）（已由计划 D 的单页 TaskBasicsCard + TaskFormPage 取代，见文末修订）
1. 选目标：下拉 + “新增目标”内联表单。
2. 选钱包：只列 `status=active` 的钱包，显示余额。
3. 策略表单（§8.2）→ `POST /api/tasks`。

编辑用同一表单预填，提交 `PUT /api/tasks/:id`（不改钱包与目标）。

### 8.2 策略表单
zod schema 一处定义，同时导出表单类型与提交换算。界面单位与后端单位：

| 组 | 界面字段 | 后端字段 | 换算 |
|---|---|---|---|
| 买入 | 模式 固定金额/按比例 | `size_mode` fixed/ratio | — |
| | 固定金额（USDG） | `size_value` | ×10^6 |
| | 比例（%） | `size_value` | ×100 = bps |
| | 单笔上限（USDG） | `max_per_trade_usdg` | ×10^6 |
| | 目标最小交易额（USDG） | `min_target_trade_usdg` | ×10^6 |
| | 总额度（USDG，0=不限） | `spend_limit_usdg` | ×10^6 |
| | 单币加仓次数 | `max_addon_per_token` | — |
| 卖出 | 手动/按比例/全部 | `sell_mode` manual/proportional/all | — |
| 止盈止损 | 开关 | 关 → 三个 bps 与秒数提交 0 | — |
| | 止盈（%）、止盈卖出比例（%，默认 50）、止损（%）、最长持仓（分钟） | `take_profit_bps`、`take_profit_sell_bps`、`stop_loss_bps`、`max_hold_sec` | %×100；分钟×60 |
| 过滤 | 场所多选 内盘/内盘毕业池/Uniswap | `platforms` pons_curve/pons_pool/uniswap | — |
| | 计价币多选 USDG/ETH/股票代币 | `quote_assets` USDG/ETH/STOCK | — |
| | 跟内盘 | `follow_curve` | — |
| | 创建者税上限（%）、发射后跳过（秒）、追价上限（%）、滑点（%）、重试次数 | `max_creator_tax_bps`、`skip_launch_window_sec`、`max_chase_bps`、`slippage_bps`、`retry_max` | %×100 |
| | 黑名单地址（每行一个） | `token_blacklist` | 小写 |

默认值：fixed 10 USDG、单笔上限 20、最小交易额 5、总额度 0、加仓 1、proportional、止盈止损关、三个场所全选、USDG+ETH、跟内盘开、创建者税 2%、跳过 15 秒、追价 15%、滑点 10%、重试 2。校验：金额 ≥ 0 且最多 6 位小数；百分比 0–100；ratio 模式比例 > 0；fixed 模式金额 > 0。

### 8.3 列表
`GET /api/tasks`：目标标签/地址、钱包标签、状态（`enabled` 运行中 / 已停止；`paused_reason="admin"` 显示“管理员禁用”角标）、`spent_usdg / spend_limit_usdg` 进度条（额度 0 显示“不限”）、买卖模式摘要。操作：启用/停止（`POST /api/tasks/:id/enable|disable`；管理员禁用的任务启用按钮置灰并提示联系管理员）、编辑、删除（`DELETE /api/tasks/:id`，409 `任务仍有持仓，请先卖出` 时链接到仓位页；200 带 `warning` 时用 toast 显示 warning）、查看仓位。

## 9. 仓位、决策、信号、提现

- 仓位页 `GET /api/tasks/:id/positions`（10 s）：`token, qty, cost_usdg, avg_price_usdg, addon_count, tp_done, realized_usdg, virtual, exit_fail_count, last_exit_error, next_exit_at`。`virtual` 显示“dry-run”角标；`exit_fail_count>0` 显示“退出受阻：<last_exit_error>，连续 N 次，下次尝试 HH:MM”。
- 手动卖出：滑块 0–100%（默认 100）→ `POST /api/positions/:id/sell {pct_bps}`；成功显示后端返回，失败显示 `error` 原文。
- 决策 `GET /api/decisions?task=&outcome=&limit=50`：时间、方向、结果角标（DRY_RUN 绿 / SKIPPED 灰 / FAILED 红 / 其他蓝）、原因、`planned_amount_in`、`quoted_out`、`quoted_price_usdg`、`error`。筛选任务与结果；“加载更多”用 `limit` 递增（后端无游标）。
- 信号 `GET /api/signals?target=&since=`：时间、块号、目标、方向、代币、`token_amount`、`quote_asset`/`quote_amount`、`venue`。按目标筛选。
- 提现对话框：资产 USDG/ETH；显示当前余额；金额输入或勾“全部”（发 `"all"`）；收款地址固定为登录地址（只读，说明“只能提到登录地址”）。`POST /api/wallets/:id/withdraw {asset, amount}`：
  - 200 → 显示 `tx_hash`（浏览器链接）与“已广播”；
  - 202 → 额外显示 `note`；
  - 400 → 原文（`insufficient` / `insufficient gas` 翻译成“余额不足”“ETH 不足以支付 gas”）；409 → 原文。
  - 成功后每 3 s `GET /api/withdrawals/:id` 直到 `CONFIRMED`/`FAILED`；失败显示 `error` 并提示按哈希核对链上。
- 提现历史 `GET /api/wallets/:id/withdrawals`：时间、资产、金额、状态角标、哈希、错误。

## 10. 管理员

- 总览 `GET /api/admin/overview`（10 s）：指标卡 `users`（来自用户列表长度）、`tasks`/`tasks_enabled`、`positions_open`、`decisions_today`、`spent_usdg`；引擎卡 `engine.engine_last_block` vs `node_block`（落后 > 20 块标黄）、`last_signal_at`、`exit_scan_*`、`positions_blocked`、`node_error`/`goswapevm_error` 红字。
- 全局开关：`PUT /api/settings/kill_switch {on}`、`PUT /api/settings/dry_run {on}`，切换需确认；kill_switch 打开时全站横幅（§5）。
- 用户 `GET /api/admin/users`：`address, locked, last_login_at, wallets, tasks, positions`；锁定/解锁 `POST /api/admin/users/:address/lock|unlock` 带确认（提示在途提现不受影响）；点地址进入全站数据页并带 `owner` 过滤。
- 全站数据：一页五标签 任务/仓位/钱包/提现/决策 → `GET /api/admin/<资源>?owner=`；任务行“紧急禁用/恢复” `POST /api/admin/tasks/:id/disable|enable`；钱包标签不含密文，无导出/删除。
- 审计 `GET /api/admin/audit?owner=&action=`：时间、用户、动作、详情、IP；动作下拉：login, logout, action_sign, wallet_create, wallet_export, wallet_delete, withdraw, task_create, task_update, task_enable, task_disable, task_delete, admin_*, setting_update。

## 11. Go 托管服务（server/）

- `go:embed web/dist`（构建时由 `make build` 生成；仓库不提交 dist）。
- 路由：`/api/*` → `httputil.ReverseProxy` 到 `GOFOLLOW_URL`（默认 `http://127.0.0.1:8090`），去掉 `/api` 前缀，设置 `X-Forwarded-For`/`X-Forwarded-Proto`，透传 `Authorization`；后端不可达返回 502 JSON `{"error":"后端不可用"}`。其他路径：存在的静态文件直接返回（`/assets/*` 带哈希 → `Cache-Control: public, max-age=31536000, immutable`），否则返回 `index.html`（`Cache-Control: no-store`）。
- 环境变量：`LISTEN`（默认 `0.0.0.0:8080`）、`GOFOLLOW_URL`。只做 HTTP。
- `app.sh`：`build`（make build）、`start`（nohup bin/gofollow-front，pid 文件）、`stop`、`status`；环境变量从 `.env`（git 忽略）读。
- 开发：`vite.config.ts` 的 `server.proxy` 把 `/api` 指向 `http://127.0.0.1:8090` 并 rewrite 掉前缀，与生产同一路径规则。

## 12. gofollow 侧配置（写进 README 部署章节）

- `[api] listen = "127.0.0.1:8090"`、`trusted_proxies = ["127.0.0.1"]`、`cors_origins = []`。
- `[auth] domain` = 前端对外域名（无端口），`uri` = 前端对外完整地址（如 `http://follow.example.com:8080`）。
- 对应 go-follow 版本：README 记录 `00b657a`；接口契约以 go-follow README「接口一览」为准。

## 13. 测试

- vitest（`web/`）：`api/client` 状态码映射与 401 单次跳转；`wallets/okx` 未安装/连接/`personal_sign`（mock `window.okxwallet`）；`signAction`；策略表单 schema 的换算与校验（fixed/ratio、止盈止损关闭时提交 0、百分比边界）；金额格式化（6 位小数、wei）；删除钱包 409 分支组件测试（testing-library）。
- Go（`server/`）：代理路径改写与转发头、后端不可达 502、SPA 回退、静态资源缓存头（用 `httptest` + 临时 `fs.FS`）。
- 端到端冒烟脚本 `scripts/smoke.mjs`（可选执行，`SMOKE=1`）：对本机真实 gofollow，用内置测试私钥做 SIWE 签名，走登录 → 建钱包 → 建目标 → 建任务 → 启停 → 删任务 → 登出，校验状态码。

## 14. 分期

- 计划 A：脚手架、API 层、OKX 登录与会话、应用壳、Go 托管服务（可登录、可部署）。
- 计划 B：钱包池（含导出/删除/提现）、目标、任务向导与策略表单。
- 计划 C：仓位/决策/信号、管理员全部页面、冒烟脚本。

## 修订（2026-09-06，联调后）：§8 跟单任务

以下覆盖 §8.1 与 §8.2 买入部分；其余不变。

### 8.1（修订）新建跟单 = 单页

`/tasks/new` 一页：
- 顶部“基本信息”卡片：目标地址下拉（选项 `标签 缩写地址`）+ “新增目标”按钮（打开 `TargetDialog`，保存后自动选中）；跟单钱包下拉（只列 `status=active`）+ “创建钱包”按钮（复用钱包页 `CreateWalletDialog`，创建后自动选中），选中后显示 `余额 x USDG / y ETH`。两者未选时提交按钮禁用。
- 下方策略表单（§8.2），按钮“创建任务”。
- 编辑页 `/tasks/:id/edit` 同布局，基本信息只读。

### 8.2（修订）买入与目标过滤

| 组 | 界面字段 | 后端字段 | 换算 / 校验 |
|---|---|---|---|
| 买入 | 模式 固定金额 / 按比例 | `size_mode` | — |
| | 固定金额（USDG）——仅固定模式 | `size_value` | ×10^6；> 0 |
| | 比例（%）——仅按比例模式 | `size_value` | ×100 = bps；≥ 0.01，**无上限**，最多 2 位小数 |
| | 我方下限（USDG，可选）——仅按比例 | `ratio_min_usdg` | ×10^6；空 = 0 |
| | 我方上限（USDG，必填）——仅按比例 | `max_per_trade_usdg` | ×10^6；> 0 且 ≥ 下限；固定模式提交 `"0"` |
| | 总额度（USDG，0=不限）、单币加仓次数 | 不变 | |
| 目标买入过滤 | 目标最小买入（USDG，可选） | `min_target_trade_usdg` | ×10^6；空 = 0 |
| | 目标最大买入（USDG，可选） | `max_target_trade_usdg` | ×10^6；空 = 0；两者都填时 min ≤ max |

默认值：固定 10 USDG；按比例默认 10%、下限空、上限 20；目标过滤两项空。任务列表摘要：固定 `固定 10 USDG`；按比例 `比例 10%（下限–上限 USDG）`；目标过滤有值时追加 `目标 ≥/≤ …`。

## 实现修订（2026-09-06，计划 D）

- `CreateWalletDialog.onCreated` 与 `TargetDialog.onSaved` 改为带结果参数：`onCreated(result: { id: number; address: string }): void`；`onSaved(result?: { id: number; address: string }): void`（`TargetDialog` 编辑已有目标时不新增选项，调用 `onSaved()` 不带参数）。调用方据此把新建的钱包/目标直接选中，无需等待列表重新拉取。
- `StrategyForm` 新增可选 prop `submitDisabled`：基本信息（目标/钱包）未选时由外层置 `true`，与内部 `busy` 一起禁用提交按钮。
- 原三步向导删除，改为 `TaskBasicsCard`（目标/钱包选择 + 新增目标/创建钱包）+ `TaskFormPage`（单页新建，`/tasks/new`）；编辑页 `TaskEditPage` 复用同一组件，基本信息只读。
- `TaskBasicsCard` 在下拉列表重取完成前，为刚创建的目标/钱包补一个“占位”选项（用 `onCreated`/`onSaved` 返回的 `id`/`address` 构造），避免用户选中后列表重取期间下拉找不到该项而回退为未选中；列表重取到位后占位选项被真实数据替换。
- 固定模式下编辑回读：无论后端存的 `max_per_trade_usdg` 是什么值，界面一律不展示、也不使用该值，而是回填一个可用的默认上限（避免用户切回按比例模式时立刻被“必须大于 0”卡住）；提交固定模式时该字段恒为 `"0"`。
- 后端 `max_per_trade_usdg = 0` 表示无上限（迁移前的 API 不允许为 0，实际不会出现）；界面在按比例模式下仍要求填写上限。
- 任务列表摘要（`TaskRow.summaryText`）改为复用 `strategySchema` 导出的 `ratioSummary(t)`/`targetFilterSummary(t)`：固定 `固定 10 USDG`；按比例 `比例 10%（5–50 USDG）`（无下限时 `比例 10%（≤50 USDG）`）；目标过滤追加 ` · 目标 ≥1 USDG` / ` · 目标 ≤100 USDG` / ` · 目标 1–100 USDG`；再接 ` · <卖出模式文案>`，止盈止损任一项开启时追加 ` · 止盈止损`。

## 实现修订（2026-09-06，计划 C）

- 请求统一 30 s 超时（`web/src/api/client.ts` 的 `REQUEST_TIMEOUT_MS`），超时映射为 `ApiError(0, '请求超时')`。
- 新增 `VITE_EXPLORER_ADDRESS_BASE` 编译期变量，用于把地址渲染成区块浏览器链接（`web/src/lib/explorer.ts` 的 `addressUrl`）；未配置时仅显示地址与复制按钮。
- 仓位页支持 `?task=` 查询参数预选任务。
- 决策/信号列表的“加载更多”用 `limit` 参数递增实现（后端未提供游标分页）。
- 管理员全站数据页的标签与 `owner` 过滤走 URL 查询参数，可直接分享/刷新保留状态。
- 端到端冒烟脚本（`scripts/smoke.mjs`）不删除脚本自建的钱包（删除钱包需要动作签名，脚本不做）。
- 数字型百分比字段（`take_profit_pct`、`take_profit_sell_pct`、`stop_loss_pct`、`max_creator_tax_pct`、`max_chase_pct`、`slippage_pct`）限制最多 2 位小数，超出时提示“最多 2 位小数”。
- 管理员提现标签显示“交易 ID”（后端 `/admin/withdrawals` 不返回 `tx_hash`），后端补 `tx_hash` 后再改为哈希链接。

## 修订（2026-09-06，多账号切换）：§3 登录与会话、§5 应用壳

- 账号来源：`eth_accounts`（不弹窗）返回的已授权地址列表；`accountsChanged` 时刷新。`requestAccounts` 仍用于首次连接。
- 登录页：显示“账号”下拉（默认插件当前选中地址），按钮“以此账号登录”，对选中地址走 SIWE。若插件尚未授权本站，下拉为空，按钮退回“连接 OKX 并登录”。
- 顶部：登录地址改为下拉，列出全部已授权地址，当前会话地址打勾；选另一个地址 → 对该地址签名登录 → 成功则替换会话、`queryClient.clear()`、跳回当前页；失败则 toast `请在 OKX 里切到该账号后重试`，会话不变。
- 切换保护（修订）：`accountsChanged` 时：会话地址仍在列表 → 不动；列表为空 → 登出；否则自动对新地址签名登录，失败登出。切换链路（含失败时的登出）进行中收到的新事件不是被忽略，而是锁存最新一次，等这条链路彻底跑完再补跑；`logout` 只清除发起时的那个会话，避免与切换中的新会话竞争。登录页预选插件当前地址。
- 下拉末项“切换账号…”：`wallet_requestPermissions({eth_accounts:{}})`；方法不存在或报 4200/-32601 时不显示该项。
- 测试：登录页多地址下拉与预选；顶部切换成功/失败两条路径；`accountsChanged` 刷新列表。

真机结论（2026-09-06）：OKX 只返回当前选中账号，下拉仅一项；改为插件切换后自动弹签名登录，失败回登录页。

本机记住每个地址的会话（2026-09-06）：切到曾登录过的地址时，先复用本机保存的那个地址的会话（后端 TTL 168 h 内），用 `/auth/me` 校验通过即可，不用重新签名；校验不通过才签名登录。用户点登出清掉本机保存的全部地址的会话。

## 修订（2026-09-06，系统内切换已登录账号）：§3 登录与会话、§5 应用壳

- 顶部下拉的选项来源改为本机记住的会话（当前会话地址 + `session.ts` 的 `saved`，按小写地址去重，显示 `shortAddress`），不再以插件的 `eth_accounts` 为主——系统内切换本来就是为了不必回 OKX。插件当前选中账号如果不在 `saved` 里也加进来，标注“（插件当前）”；选它走原来的签名登录路径。`saved` 里已过期的地址仍列出，标注“（需重新签名）”；选中它走 `runSwitchChain`，会经 `resumeOrLogin` 发现缓存无效后 `loginAs` 弹签名，若 OKX 当前不是该账号，签名失败/被拒时展示现有的固定提示。
- 选中有效缓存地址 → `runSwitchChain`：`resumeOrLogin` 命中缓存并经 `/auth/me` 校验后直接切换，不弹签名，成功 toast `已切换到 …`。
- 下拉在任意一条切换链路（手动或插件自动触发）忙碌期间整体禁用：auth.ts 导出 `subscribeSwitchBusy`/`isSwitchBusy`，顶部用 `useSyncExternalStore` 订阅。
- `accountsChanged` 规则改为按插件是否真的切换选中账号判断，而不是“会话地址是否还在列表里”：记录 `pluginCurrent`（插件上一次选中的账号）。`pluginCurrent` 只归 `handleAccountsChanged`（事件处理，包括 `chainBusy` 期间锁存、事后补跑的那次）写，`useOkxAccounts` 的 `refresh()`（首次 `listAccounts()`、它自己的 `accountsChanged` 监听、`requestPermissions` 成功后的手动刷新）只能通过 `notePluginAccounts` 在还没有任何基准值时初始化一次，之后都是空操作——否则 `refresh()` 可能抢在事件处理前面把“还没处理的变化”提前记成“已知状态”，导致锁存事件补跑时被判成“没变”而漏掉一次该有的自动切换。`accounts[0]` 跟 `pluginCurrent` 一样 → 插件选中没变（锁定/解锁、单纯调整授权等）→ 不动会话，哪怕这时会话地址跟 `accounts[0]` 本来就不一致；`accounts[0]` 真的变了才看是否需要自动切换（跟会话地址不同才 `runSwitchChain`）。页面刚加载、还没有 `pluginCurrent` 时按“变了”处理，等同旧行为。
- 自动切换失败（插件切到的新地址签名被拒/失败）不再走用户主动登出那套 `logout()`/`clearAllSessions()`：只清掉当前显示的会话（回登录页）、忘掉这次没能切成功的目标地址的缓存，本机记住的其它地址原样保留——下拉的价值就在这些缓存上，一次自动切换失败不该把它们全部清空。`clearAllSessions()` 只留给用户主动登出、以及 `accounts` 为空（插件撤销了整个授权）这种“全部都不认了”的场景。
- 需要签名的操作（`signAction`、登录页 `loginAs`）在发起签名前用 `listAccounts()`（不弹窗）确认 OKX 当前选中账号是否与目标地址一致；不一致就提示“请在 OKX 里切到 `<地址>` 后重试”，不发起签名/不弹窗；一致或查不到当前账号（未安装/未授权）则照常进行，交给现有错误提示兜底。插件当前选中的账号在下拉里始终标注“（插件当前）”，哪怕它同时也在 `saved` 里（包括过期的）——用户得知道哪个地址眼下真能签得动。
- 测试：顶部下拉的选项 = 会话 + `saved`（含过期/插件当前标注，标注可叠加）；选有效缓存地址不弹签名；忙碌时下拉禁用；`accountsChanged` 同一 `accounts[0]` 重复事件不触发切换、选中变化才触发、首次事件按“变了”处理；`refresh()`/`requestPermissions` 触发的 `notePluginAccounts` 不会污染一次真正的自动切换（回归用例）；自动切换失败只忘记目标地址、其它 `saved` 条目原样保留；`signAction`/登录页在插件当前 ≠ 目标地址时给出提示且不签名。

## 实现修订（2026-09-07，计划 E）

- §8.2 策略表单：删除总额度（`spend_limit_usdg`）、场所（`platforms`）、计价币（`quote_assets`）、跟内盘（`follow_curve`）、创建者税上限（`max_creator_tax_bps`）、发射后跳过（`skip_launch_window_sec`）、任务级黑名单（`token_blacklist`）共七个字段（本节与「修订（联调后）：§8 跟单任务」中仍写着“总额度不变”的描述以本条为准）；后端对携带它们的请求返回 400。表单“过滤”分组精简为“风险控制”（追价上限/滑点/重试次数），追价上限下方补充一行 STOCK 计价信号提示。任务列表不再展示花费进度条，改为一行“累计买入 X USDG”。端到端冒烟脚本 `scripts/smoke.mjs` 同步删除这些字段。
- 新增用户级黑名单，替代原任务级 `token_blacklist`：按用户一份，对该用户名下所有跟单任务生效，只拦买入。接口 `GET/PUT /api/settings/blacklist`，`{tokens: string[]}`；`PUT` 成功时可能带 `warning`（如“引擎黑名单缓存未刷新，请重试”），前端用 `toast.error` 展示；请求非法地址时 400，`error` 原文形如“非法地址: 0xzz”。
  - 新页面 `/blacklist`（导航项“黑名单”，紧跟在“跟单”之后）：说明文案“每行一个代币地址，对你的所有跟单任务生效，只拦买入”；一个 textarea，每行一个地址，受控状态只在查询首次成功返回时用结果初始化（之后的重取不再覆盖用户正在编辑的内容），该查询不轮询。
  - 保存前按行拆分、trim、忽略空行，用 viem 的 `isAddress`/`getAddress` 校验并规范化为小写去重；发现非法行就地提示“第 {n} 行不是合法地址”（n 为原始行号，不算被忽略的空行）且不发请求；超过 500 条提示“最多 500 条”。
  - 校验通过后 `PUT /api/settings/blacklist`；成功 toast“黑名单已保存”并把返回结果写回查询缓存；`warning` 按上面规则再弹一条；后端 400（如地址格式在服务端才发现的问题）就地展示 `error` 原文，不走全局 toast。页面底部显示当前条数“共 {n} 条”。
- 上线顺序：本计划合并后，go-follow 后端用 `bin/gofollow`（`52dd39d`）重启，前端 `./app.sh build && ./app.sh restart`，两边一起重启后再跑 `scripts/smoke.mjs`——避免旧前端仍提交已删除的任务级字段被新后端拒绝，或新前端调用旧后端还不存在的 `/settings/blacklist`。

## 实现修订（2026-09-07，计划 F）

- 依赖 go-follow ≥ `eb1c72c`：`GET /signals` 响应新增 `tx_from`、`via`（`self|relay`）、`relay_router` 三个字段，并接受 `?via=` 查询参数；`max_addon_per_token` 允许提交 `0`（表示不限）。
- 信号页（`SignalsPage`）：
  - “目标”旁新增“来源”筛选（`Select`，选项 全部/本人/代发），选中时把 `via: 'self' | 'relay'` 并入查询参数与 `queryKey`，`全部` 不带该参数。
  - 表格“目标”列在地址后追加来源标签：`self` 灰色 `本人`；`relay` 蓝色 `代发`，鼠标悬停显示 `发送方 {shortAddress(tx_from)}`。
- 跟单任务表单：`单币加仓次数` 字段允许输入 `0`（表示不限加仓次数上限），标签改为“单币加仓次数（0 = 不限）”，`min` 属性由 `1` 改为 `0`；`strategySchema` 校验从 `.min(1, '至少 1 次')` 改为 `.min(0, '不能为负')`，默认值仍为 `1`。

## 实现修订（2026-09-08，计划 G）

跟随 go-follow 实盘执行 P3（依赖 ≥ `549afa3`）：管理员 operator 钱包页；决策列表显示新状态与成交字段；仓位页在途/dry-run 遗留标签；总览显示可用 operator 数。

- §9 决策：结果角标改为 `EXECUTED`/`DRY_RUN` 绿、`SKIPPED` 灰、`FAILED` 红、`PENDING`/`SENT` 蓝（原文写“其他蓝”已不准确，`EXECUTED` 单独改绿）；表格新增“成交”列（`filled_in`/`filled_out` 未成交时为 `"0"`/`"0"`，显示 `—`；成交后按买卖方向换算：买入“花 x USDG 得 y”、卖出“花 x 得 y USDG”，`y`/`x` 的代币一侧精度未知原样显示整数字符串）、“交易”列（`tx_hash` 缩写 + 区块浏览器链接，无哈希显示 `—`）、“gas”列（`gas_used`，为 0 显示 `—`）；筛选下拉新增 `PENDING`、`SENT` 两项；`reason=capped`（被单笔上限截断的成功买入）在结果角标旁额外加一个琥珀色“已截断”角标，不改变 outcome 本身、不算跳过。
- §9 仓位：“在途”标签（蓝）——同一 `(task_id, token)`（代币地址大小写不敏感比较）最近一条决策的 `outcome` 为 `PENDING`/`SENT`，且该决策 `created_at`（`Date.parse` 比较）晚于这条仓位的 `updated_at`；通过 `useQuery(['decisions', task_id, 'recent'], () => decisionsApi.list({task: task_id, limit: 50}))`（10 s 轮询）取数，回执落地后引擎重新记账、`updated_at` 推进，标记随之消失。`virtual=true` 且当前 `GET /health` 的 `dry_run=false`（即已从模拟切到实盘）时，原有的灰色“dry-run”角标换成琥珀色“dry-run 遗留”；仍处于 dry-run 模式（或 health 还没取回来）时保留原有灰色“dry-run”角标不变。手动卖出成功返回 `outcome:"SENT"` 时额外显示“已广播，等待回执（tx_id N）”。
- §10 总览：指标卡新增“可用 operator”（`engine.operators_ready`）。
- 新增 §6.1 Operator 钱包页（`/admin/operators`，仅管理员，导航“管理”组紧跟在“审计”之后，标签 `Operator`）：
  - 页面说明“签所有跟单交易、只付 gas；生成后需在掌钥机登记再启用”；顶部显示 `GET /exec/status` 的“可用 operator {n} · 授权缓存 {n}”。
  - `生成`（`POST /admin/operators`，无需入参）成功后 toast“已生成 {shortAddress(address)}”并刷新列表；新生成的一把状态恒为**未登记**、**已停用**。
  - 表格列：地址（可复制 + 区块浏览器链接）、ETH 余额（`weiToEth`）、登记（已登记绿 / 未登记琥珀）、状态（已启用蓝 / 已停用灰 / 已摘除：`{removed_reason}` 红——`removed` 与 `enabled` 是后端两个独立字段，摘除优先于启停展示）、在途（`in_flight`）、操作。
  - 操作按状态（`removed` 优先于 `registered`/`enabled` 判断）：已摘除只有 `启用`（`POST .../enable`，清摘除状态与失败计数，即“恢复”，按钮文案仍是“启用”不单独造词）；未登记只有 `删除`；已登记未启用有 `启用`、`删除`、`提回 ETH`；已启用有 `停用`、`提回 ETH`。
  - `启用` 在链上未登记时后端返回 409 `尚未在链上登记为 operator`，行内展示（`role="alert"`），不走全局 toast。
  - `删除` 先弹 `ConfirmDialog`（标题“删除 operator”，说明“删除后私钥无法找回，请确认已提回 ETH 并在掌钥机撤销登记”，确认按钮“确认删除”）→ `DELETE /admin/operators/:id`；409（已启用/仍有在途交易/链上登记状态未知/仍链上登记/钱包仍有余额五种文案之一）时关掉确认框，在该行行内展示错误原文并出现 `强制删除` 按钮，点击后带 `force=true` 直接重试（不再二次确认）。
  - `提回 ETH` 打开 `OperatorWithdrawDialog`：金额（ETH）输入或勾选“全部”（发 `"all"`）→ `POST /admin/operators/:id/withdraw {amount}`（收款地址恒为管理员登录地址，后端决定、前端不传）；200/202 都要处理（复用 `walletsApi.withdraw` 的 `requestFull` 模式），成功 toast“已提交提回”，展示状态角标（复用 `withdrawStatus.ts` 的 `statusTone`/`statusText`）与哈希（区块浏览器链接或原文+复制按钮）。
- 类型：`Operator`（`id, address, label, enabled, registered, in_flight, removed, removed_reason, created_at, eth_balance, eth_error?`）、`ExecStatus`（`operators_ready, allowance_cache_entries, daily_spent: {wallet_id, spent_usdg}[], since?`）定义在 `api/admin.ts`；`Decision` 加 `token, tx_id, tx_hash, filled_in, filled_out, gas_used`；`SellResult` 加 `tx_id?`。
