# go-follow-front

go-follow（Robinhood Chain 链上跟单服务）的 Web 前端：OKX 钱包签名登录，管理跟单钱包、目标地址、跟单任务、仓位与提现；管理员有全站总览。

- 前端：`web/`（React 18 + Vite + TypeScript + Tailwind + TanStack Query + shadcn/ui）
- 托管：`server/`（Go，`go:embed` 打包 `web/dist`，`/api/*` 反代到 gofollow，其余回 `index.html`）
- 设计：`docs/superpowers/specs/2026-09-06-frontend-design.md`；需求记录：`docs/2026-09-06-需求讨论记录.md`
- 对应 go-follow 版本：`549afa3`；接口契约以 go-follow README「接口一览」为准

## 部署（gofollow 侧配置）

```toml
[api]
listen = "127.0.0.1:8090"
trusted_proxies = ["127.0.0.1"]
cors_origins = []

[auth]
domain = "follow.example.com"            # 前端对外域名（无端口）
uri = "http://follow.example.com:8080"   # 前端对外完整地址
```

`trusted_proxies` 要填本前端服务所在主机的 IP：与 gofollow 同机就是 `127.0.0.1`，分开部署时改成前端那台机器的 IP，否则 gofollow 的限流和审计记录到的都是反代自己的地址，而不是真实用户 IP。

前端服务环境变量：`LISTEN`（默认 `0.0.0.0:8080`）、`GOFOLLOW_URL`（默认 `http://127.0.0.1:8090`）。第一版只做 HTTP。

## 开发

```bash
cd web && npm install
npm run dev        # http://127.0.0.1:5173，/api 反代到本机 gofollow(:8090)
npm test           # vitest（watch）；CI 用 npm test -- --run
npm run typecheck
npm run build      # 产物在 web/dist
```

联调时若 gofollow 本机 `config.toml` 的 `[auth] domain="localhost"`、`uri="http://127.0.0.1:8090"` 与前端开发地址 `127.0.0.1:5173` 不一致，OKX 签名弹窗里显示的 domain 会和当前页面地址不同——这是预期的（联调阶段后端未按前端地址配置），登录本身仍能成功；正式部署时按上面「部署」一节把 `domain`/`uri` 改成前端对外地址即可。

需要在提现记录里展示区块浏览器链接时，复制 `web/.env.example` 为 `web/.env` 并设置 `VITE_EXPLORER_BASE`（如 `https://explorer.example/tx/`）；不配置时界面只显示交易哈希与复制按钮。

`VITE_EXPLORER_BASE` 是 Vite 的编译期变量，值在构建时就被写进产物：`web/.env` 不只要在 `npm run dev` 前准备好，`./app.sh build` 前也必须存在，否则打出来的包里没有浏览器链接（改完要重新构建才生效）。

类似地，需要把钱包地址、目标地址等渲染成区块浏览器链接时，设置 `VITE_EXPLORER_ADDRESS_BASE`（如 `https://explorer.example/address/`）；同样是编译期变量，规则与 `VITE_EXPLORER_BASE` 一致，不配置时界面只显示地址与复制按钮。

## 跟单任务

新建/编辑跟单任务在同一页完成，买入规模有两种模式：

- **固定金额**：每次跟单固定买入指定数量的 USDG。
- **按比例**：按目标钱包买入额的比例跟单，下限（`ratio_min`）可选、上限（`max_per_trade`）必填，比例本身允许超过 100%。

另外可选配置「目标买入过滤」（`target_min`/`target_max`，各自可选）：只跟单目标钱包单笔买入额落在该区间内的交易。

任务列表的摘要列会汇总以上配置，例如 `固定 10 USDG · 按比例卖`、`比例 10%（5–50 USDG） · 目标 ≥1 USDG · 按比例卖`。

以上字段依赖 go-follow ≥ `6008624`（迁移 4），版本过低会导致创建/编辑任务失败。

## 黑名单

黑名单按用户一份（不再挂在单个任务上），对该用户名下所有跟单任务生效，只拦买入。导航“黑名单”页里每行填一个代币地址，保存时校验格式并去重规范化为小写；`GET/PUT /api/settings/blacklist` 对应 `{tokens: string[]}`。

依赖 go-follow ≥ `52dd39d`（迁移 5），后端与前端需一起重启。

## 实盘执行

跟随 go-follow 实盘执行（P3）：`dry_run=false` 时决策会真实上链，管理员需要先在「管理 → Operator」页生成、登记、启用签单用的系统钱包（operator）。

- **Operator 钱包页**（`/admin/operators`，仅管理员）：`生成` 创建一把新 operator（私钥加密入库，不接受导入），生成后状态为**未登记**，需要管理员在掌钥机对合约执行 `setOperator(addr, true)` 登记后，页面上的 `启用` 按钮才会成功（未登记时点 `启用` 返回 409，页面行内提示）；已启用的 operator 才会被派单选中签单。`删除`（前置：已停用、无在途交易；仍链上登记时后端 409 提示先去掌钥机撤销登记，可用 `强制删除` 带 `force=1` 确认放行）与 `提回 ETH`（提到管理员登录地址，全部或指定金额）同理走 `POST /admin/operators/:id/{enable,disable}`、`DELETE /admin/operators/:id`、`POST /admin/operators/:id/withdraw`。页面顶部显示 `GET /exec/status` 的可用 operator 数与授权缓存条数，总览页也有「可用 operator」指标卡。
- **决策列表**新增「成交」（按买卖方向换算 `filled_in`/`filled_out`）、「交易」（`tx_hash` 缩写 + 区块浏览器链接）、「gas」列；结果角标新增 `PENDING`/`SENT`（蓝）状态，`EXECUTED` 改为绿色；`capped`（被单笔上限截断）在结果角标旁额外标一个「已截断」提示，不影响 outcome 本身。
- **仓位页**：某任务下某代币最近一条决策若为 `PENDING`/`SENT` 且比该仓位的更新时间新，标蓝色「在途」；`dry_run` 从 true 切到 false 后遗留的虚拟仓位（`virtual=true`）标琥珀色「dry-run 遗留」，这类仓位只读展示，手动卖出会被后端拒绝。

依赖 go-follow ≥ `549afa3`（`/decisions` 返回 `token`，仓位页按 `(task_id, token)` 精确匹配判断在途；更早版本的决策行没有这个字段会导致仓位页报错）。

## 构建与运行

```bash
cp .env.example .env   # 按需改 LISTEN / GOFOLLOW_URL
./app.sh build         # npm ci && npm run build && go build -tags embeddist
./app.sh start         # 后台运行，日志 logs/gofollow-front.log
./app.sh status | stop | restart
```

不打包时（开发）也可以直接跑 Go 服务从磁盘读产物：`cd web && npm run build && cd .. && go run ./cmd/gofollow-front`（`WEB_DIST` 可改目录）。

测试：`make test`。

## 端到端冒烟

`scripts/smoke.mjs` 对着一个真实运行中的 gofollow（可经前端反代，也可直连）跑一遍完整流程：SIWE 登录 → 建钱包 → 建目标 → 建任务 → 启停任务 → 查仓位/决策 → 删任务 → 删目标 → 登出。

前置：

- gofollow 与本前端服务（或 `npm run dev`）都已在跑；
- `SMOKE_KEY` 是一把只用于测试的私钥（不要用真实资金钱包的私钥）——脚本用它签名 SIWE 挑战，随机生成一把新私钥即可，其地址会自动注册为普通用户（非管理员），脚本也不会调用任何 `/admin/*` 接口；
- 脚本会在数据库里留下一条钱包记录（删除钱包需要动作签名，脚本不做，留着不影响联调；可在页面上手动删除）；建的目标与任务会在脚本末尾自动删除。

首次使用先在仓库根安装依赖（只有 `viem` 一个依赖，用于本地签名）：

```bash
npm install
```

然后运行——为了不让私钥留在 shell 历史里，先把它写进一个已加入 `.gitignore` 的本地文件，再用 `.` 把它加载进环境变量：

```bash
node -e "console.log('SMOKE_KEY=0x' + require('crypto').randomBytes(32).toString('hex'))" > scripts/.smoke.env
echo "BASE=http://127.0.0.1:8080/api" >> scripts/.smoke.env
set -a; . scripts/.smoke.env; set +a
node scripts/smoke.mjs
```

（也可以用 `npm run smoke` 代替 `node scripts/smoke.mjs`，环境变量照旧。）每一步成功会打印 `✓ METHOD path → status`；任一步失败会抛出包含状态码与响应体的错误并以非零码退出。
