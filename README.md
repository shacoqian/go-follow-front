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

前端服务环境变量：`LISTEN`（默认 `0.0.0.0:8080`）、`GOFOLLOW_URL`（默认 `http://127.0.0.1:8090`）。第一版只做 HTTP。
