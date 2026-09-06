# go-follow-front

go-follow（Robinhood Chain 链上跟单服务）的 Web 前端：OKX 钱包签名登录，管理跟单钱包、目标地址、跟单任务、仓位与提现；管理员有全站总览。

- 前端：`web/`（React 18 + Vite + TypeScript + Tailwind + TanStack Query + shadcn/ui）
- 托管：`server/`（Go，`go:embed` 打包 `web/dist`，`/api/*` 反代到 gofollow，其余回 `index.html`）
- 设计：`docs/superpowers/specs/2026-09-06-frontend-design.md`；需求记录：`docs/2026-09-06-需求讨论记录.md`
- 对应 go-follow 版本：`00b657a`；接口契约以 go-follow README「接口一览」为准

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

## 构建与运行

```bash
cp .env.example .env   # 按需改 LISTEN / GOFOLLOW_URL
./app.sh build         # npm ci && npm run build && go build -tags embeddist
./app.sh start         # 后台运行，日志 logs/gofollow-front.log
./app.sh status | stop | restart
```

不打包时（开发）也可以直接跑 Go 服务从磁盘读产物：`cd web && npm run build && cd .. && go run ./cmd/gofollow-front`（`WEB_DIST` 可改目录）。

测试：`make test`。
