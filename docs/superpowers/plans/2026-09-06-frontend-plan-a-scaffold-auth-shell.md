# go-follow-front 计划 A：脚手架、API 层、OKX 登录与会话、应用壳、Go 托管服务 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一个能登录、能部署的空壳：React 应用可用 OKX 钱包完成 SIWE 登录并进入带导航的应用壳（各页面先放占位），Go 服务能托管构建产物并把 `/api` 反代到 gofollow。

**Architecture:** `web/` 是 Vite + React 18 + TS 应用，`src/api` 是唯一的 fetch 出口（状态码统一映射为 `ApiError`），`src/wallets/okx.ts` 封装 EIP-1193 调用，`src/features/auth` 持有会话（zustand + localStorage）与登录/登出/动作签名流程，`src/app` 是路由与壳。仓库根是 Go module `gofollowfront`：根包按 build tag 决定静态资源来自 `go:embed` 还是磁盘目录，`server/` 包把 `/api/*` 反代到 gofollow、其余路径做 SPA 回退，`cmd/gofollow-front` 是入口。

**Tech Stack:** Node 22 / npm 10；React 18.3、Vite 5.4、TypeScript 5.9、Tailwind 3.4、TanStack Query 5、zustand 5、react-router-dom 6.30、viem 2；vitest 2 + jsdom + Testing Library；Go 1.22+（本机 1.25）。

**Spec:** `docs/superpowers/specs/2026-09-06-frontend-design.md` §2–§5、§11–§13（§6–§10 的页面在计划 B/C）。

## Global Constraints

- 依赖版本固定为下面 package.json 里写的范围；不用 React 19、Vite 6+、Tailwind 4、TypeScript 7。
- 所有请求经 `src/api/client.ts` 的 `request()`；基址 `/api`；状态码映射文案（verbatim）：401 `登录已失效，请重新登录`、403 后端文案否则 `账号已被管理员锁定`、404 `资源不存在或无权访问`、429 `操作过于频繁，请稍后再试`、5xx 后端文案否则 `内部错误`、网络错误 `无法连接服务`（status 0）、其他 4xx 后端 `error` 原文。
- 会话持久化键 `gofollow.session`；请求头 `Authorization: Bearer <token>`；401 清会话；OKX `accountsChanged` 地址变化即登出。
- 只支持 OKX：`window.okxwallet`；登录用 `personal_sign`（消息按 UTF-8 转 hex 作为第一个参数）；不切链。
- 动作签名每次重新请求挑战，不缓存签名。
- 界面文案全部中文；不在 console/日志里打印 token、签名、消息原文。
- Go 服务：`/api/*` 反代到 `GOFOLLOW_URL`（默认 `http://127.0.0.1:8090`）并去掉 `/api` 前缀，设置 `X-Forwarded-For`/`X-Forwarded-Proto`，后端不可达回 `502 {"error":"后端不可用"}`；`/assets/*` 带 `Cache-Control: public, max-age=31536000, immutable`；其余回 `index.html` 带 `Cache-Control: no-store`；监听 `LISTEN`（默认 `0.0.0.0:8080`）；只 HTTP。
- 每个任务结束：`cd web && npm run typecheck && npm test -- --run` 全绿（Task 6 再加 `gofmt -l . && go vet ./... && go test ./...`）再提交；提交信息中文 `type: 描述`，末尾两行 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`、`Claude-Session: https://claude.ai/code/session_01JJEvVxrebNuQqK1oVc99hf`。
- `web/dist/`、`node_modules/`、`bin/`、`.env` 不入库（已在 `.gitignore`）。
- 不做：任何业务页面（钱包/目标/任务/仓位/管理员的真实内容都是占位）、shadcn CLI（本计划只手写 `Button` 一个原语，风格按 shadcn 约定，后续计划再引入 CLI）、HTTPS、i18n。

---

### Task 1: 脚手架（Vite + React + TS + Tailwind + vitest）

**Files:**
- Create: `web/package.json`、`web/vite.config.ts`、`web/tsconfig.json`、`web/tsconfig.node.json`、`web/tailwind.config.js`、`web/postcss.config.js`、`web/index.html`、`web/src/main.tsx`、`web/src/App.tsx`、`web/src/index.css`、`web/src/vite-env.d.ts`、`web/src/test/setup.ts`、`web/src/App.test.tsx`、`web/src/lib/cn.ts`、`web/src/components/ui/button.tsx`、`.env.example`
- Modify: `README.md`（开发章节）

**Interfaces:**
- Produces: `cn(...inputs)`（`web/src/lib/cn.ts`），`<Button variant="default|outline|ghost|destructive" size="default|sm|lg">`（`web/src/components/ui/button.tsx`），npm 脚本 `dev`/`build`/`typecheck`/`test`，路径别名 `@/` → `web/src/`。

- [ ] **Step 1: 写工程文件**

`web/package.json`：
```json
{
  "name": "go-follow-front",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.102.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.0",
    "tailwind-merge": "^3.6.0",
    "viem": "^2.56.0",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.10.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.20.0",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.7.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.19",
    "typescript": "~5.9.3",
    "vite": "^5.4.21",
    "vitest": "^2.1.9"
  }
}
```

`web/vite.config.ts`：
```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// /api 反代到本机 gofollow，路径规则与生产的 Go 服务一致（去掉 /api 前缀）。
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8090', changeOrigin: false, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
```

`web/tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`web/tsconfig.node.json`：
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

`web/tailwind.config.js`：
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`web/postcss.config.js`：
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`web/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>go-follow</title>
  </head>
  <body class="bg-slate-50 text-slate-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/index.css`：
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`web/src/vite-env.d.ts`：
```ts
/// <reference types="vite/client" />
```

`web/src/test/setup.ts`：
```ts
import '@testing-library/jest-dom/vitest'
```

`web/src/lib/cn.ts`：
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// 合并 Tailwind 类名：clsx 处理条件，twMerge 消掉冲突（如 px-2 与 px-4 只留后者）。
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

`web/src/components/ui/button.tsx`（shadcn 风格，手写）：
```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
  {
    variants: {
      variant: {
        default: 'bg-slate-900 text-white hover:bg-slate-700',
        outline: 'border border-slate-300 bg-white hover:bg-slate-100',
        ghost: 'hover:bg-slate-100',
        destructive: 'bg-red-600 text-white hover:bg-red-500',
      },
      size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3 text-xs', lg: 'h-10 px-6' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'
```

`web/src/App.tsx`（本任务占位，Task 5 替换）：
```tsx
export default function App() {
  return <h1 className="p-6 text-xl font-semibold">go-follow</h1>
}
```

`web/src/main.tsx`：
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`.env.example`（仓库根）：
```
LISTEN=0.0.0.0:8080
GOFOLLOW_URL=http://127.0.0.1:8090
```

- [ ] **Step 2: 写冒烟测试**

`web/src/App.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders app title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'go-follow' })).toBeInTheDocument()
})
```

- [ ] **Step 3: 安装依赖并验证**

Run: `cd web && npm install && npm run typecheck && npm test -- --run && npm run build && ls dist/assets | head`
Expected: 安装成功生成 `package-lock.json`；typecheck 无错；1 个测试通过；`dist/index.html` 与 `dist/assets/index-*.js` 存在。

- [ ] **Step 4: README 开发章节**

`README.md` 末尾追加：
```markdown
## 开发

```bash
cd web && npm install
npm run dev        # http://127.0.0.1:5173，/api 反代到本机 gofollow(:8090)
npm test           # vitest（watch）；CI 用 npm test -- --run
npm run typecheck
npm run build      # 产物在 web/dist
```
```

- [ ] **Step 5: 提交**

```bash
git add web .env.example README.md
git commit -m "chore: 前端脚手架（Vite + React 18 + TS + Tailwind + vitest）"
```
（`web/package-lock.json` 一并提交；`web/node_modules`、`web/dist` 已被忽略。）

---

### Task 2: API 层（client、auth、health）

**Files:**
- Create: `web/src/api/client.ts`、`web/src/api/types.ts`、`web/src/api/auth.ts`、`web/src/api/health.ts`
- Test: `web/src/api/client.test.ts`、`web/src/api/auth.test.ts`

**Interfaces:**
- Produces:
```ts
// client.ts
export class ApiError extends Error { status: number; data?: unknown }
export function configureClient(opts: { token: () => string | null; onUnauthorized: () => void }): void
export function request<T>(method: 'GET'|'POST'|'PUT'|'DELETE', path: string, body?: unknown): Promise<T>
export function messageFor(status: number, backendMessage: string): string
// types.ts
export type Role = 'admin' | 'user'
export interface Me { address: string; role: Role }
export interface VerifyResponse { token: string; address: string; role: Role; expires_at: string }
export interface Health { dry_run: boolean; kill_switch: boolean; engine_last_block: number; node_block: number }
// auth.ts
export const authApi: { nonce(address: string): Promise<{ message: string }>; verify(address: string, signature: string): Promise<VerifyResponse>; logout(): Promise<void>; me(): Promise<Me>; action(action: string, params: Record<string, string>): Promise<{ message: string }> }
// health.ts
export const healthApi: { get(): Promise<Health> }
```

- [ ] **Step 1: 写失败测试**

`web/src/api/client.test.ts`：
```ts
import { ApiError, configureClient, messageFor, request } from './client'

function jsonResponse(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('request', () => {
  const fetchMock = vi.fn()
  const onUnauthorized = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    onUnauthorized.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    configureClient({ token: () => 'tok123', onUnauthorized })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends JSON with bearer token under /api and parses the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))
    const out = await request<{ ok: boolean }>('POST', '/wallets', { label: 'w' })
    expect(out).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/wallets')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok123')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ label: 'w' }))
  })

  it('omits Authorization and body when there is no token / no body', async () => {
    configureClient({ token: () => null, onUnauthorized })
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await request('GET', '/health')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('maps 409 to the backend error text and keeps the payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: '钱包仍被任务引用', task_ids: [3] }))
    const err = await request('DELETE', '/wallets/1').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('钱包仍被任务引用')
    expect(err.data).toEqual({ error: '钱包仍被任务引用', task_ids: [3] })
  })

  it('calls onUnauthorized exactly once per 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: '未登录' }))
    await expect(request('GET', '/auth/me')).rejects.toMatchObject({ status: 401, message: '登录已失效，请重新登录' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('maps network failure to status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(request('GET', '/health')).rejects.toMatchObject({ status: 0, message: '无法连接服务' })
  })

  it('tolerates an empty body on success', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    await expect(request('POST', '/auth/logout')).resolves.toBeNull()
  })
})

describe('messageFor', () => {
  it.each([
    [401, 'x', '登录已失效，请重新登录'],
    [403, '', '账号已被管理员锁定'],
    [403, '用户已被锁定', '用户已被锁定'],
    [404, 'not found', '资源不存在或无权访问'],
    [429, '', '操作过于频繁，请稍后再试'],
    [500, '', '内部错误'],
    [500, '内部错误', '内部错误'],
    [400, 'insufficient', 'insufficient'],
    [418, '', '请求失败（418）'],
  ])('status %i / %s → %s', (status, backend, want) => {
    expect(messageFor(status, backend)).toBe(want)
  })
})
```

`web/src/api/auth.test.ts`：
```ts
import { authApi } from './auth'
import { healthApi } from './health'
import * as client from './client'

describe('authApi / healthApi', () => {
  const req = vi.spyOn(client, 'request')
  beforeEach(() => req.mockReset())

  it('nonce posts the address', async () => {
    req.mockResolvedValue({ message: 'm' })
    await expect(authApi.nonce('0xAbC')).resolves.toEqual({ message: 'm' })
    expect(req).toHaveBeenCalledWith('POST', '/auth/nonce', { address: '0xAbC' })
  })
  it('verify posts address + signature', async () => {
    req.mockResolvedValue({ token: 't', address: '0xabc', role: 'user', expires_at: 'x' })
    await authApi.verify('0xabc', '0xsig')
    expect(req).toHaveBeenCalledWith('POST', '/auth/verify', { address: '0xabc', signature: '0xsig' })
  })
  it('action posts action + params', async () => {
    req.mockResolvedValue({ message: 'm' })
    await authApi.action('export_wallet', { wallet_id: '1' })
    expect(req).toHaveBeenCalledWith('POST', '/auth/action', { action: 'export_wallet', params: { wallet_id: '1' } })
  })
  it('me / logout / health use the right routes', async () => {
    req.mockResolvedValue({})
    await authApi.me()
    await authApi.logout()
    await healthApi.get()
    expect(req.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ['GET', '/auth/me'],
      ['POST', '/auth/logout'],
      ['GET', '/health'],
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/api`
Expected: 模块不存在，失败。

- [ ] **Step 3: 实现**

`web/src/api/client.ts`：
```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const API_BASE = '/api'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

let tokenSource: () => string | null = () => null
let unauthorized: () => void = () => {}

// 由应用入口注入：token 来自会话 store，401 时清会话（幂等，多个并发 401 也只是重复清空）。
export function configureClient(opts: { token: () => string | null; onUnauthorized: () => void }): void {
  tokenSource = opts.token
  unauthorized = opts.onUnauthorized
}

export function messageFor(status: number, backendMessage: string): string {
  switch (status) {
    case 401:
      return '登录已失效，请重新登录'
    case 403:
      return backendMessage || '账号已被管理员锁定'
    case 404:
      return '资源不存在或无权访问'
    case 429:
      return '操作过于频繁，请稍后再试'
  }
  if (status >= 500) return backendMessage || '内部错误'
  return backendMessage || `请求失败（${status}）`
}

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenSource()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, '无法连接服务')
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (res.ok) return data as T

  const backendMessage =
    data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : ''
  if (res.status === 401) unauthorized()
  throw new ApiError(res.status, messageFor(res.status, backendMessage), data ?? undefined)
}
```

`web/src/api/types.ts`：
```ts
export type Role = 'admin' | 'user'

export interface Me {
  address: string
  role: Role
}

export interface VerifyResponse {
  token: string
  address: string
  role: Role
  expires_at: string
}

export interface Health {
  dry_run: boolean
  kill_switch: boolean
  engine_last_block: number
  node_block: number
}
```

`web/src/api/auth.ts`：
```ts
import { request } from './client'
import type { Me, VerifyResponse } from './types'

export const authApi = {
  nonce: (address: string) => request<{ message: string }>('POST', '/auth/nonce', { address }),
  verify: (address: string, signature: string) => request<VerifyResponse>('POST', '/auth/verify', { address, signature }),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<Me>('GET', '/auth/me'),
  action: (action: string, params: Record<string, string>) =>
    request<{ message: string }>('POST', '/auth/action', { action, params }),
}
```

`web/src/api/health.ts`：
```ts
import { request } from './client'
import type { Health } from './types'

export const healthApi = {
  get: () => request<Health>('GET', '/health'),
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run src/api`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/api
git commit -m "feat(web): API 层——fetch 封装、状态码映射、auth/health 接口"
```

---

### Task 3: OKX 钱包封装

**Files:**
- Create: `web/src/wallets/okx.ts`
- Test: `web/src/wallets/okx.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Eip1193 { request(args: { method: string; params?: unknown[] }): Promise<unknown>; on?(event: string, cb: (...args: any[]) => void): void; removeListener?(event: string, cb: (...args: any[]) => void): void }
export function isOkxInstalled(): boolean
export function okxProvider(): Eip1193            // 未安装抛 Error('未检测到 OKX 钱包')
export function waitForOkx(timeoutMs?: number): Promise<boolean>
export async function requestAccounts(): Promise<string>   // 返回 EIP-55 校验和地址
export async function personalSign(message: string, address: string): Promise<string>
export function onAccountsChanged(cb: (accounts: string[]) => void): () => void
```

- [ ] **Step 1: 写失败测试**

`web/src/wallets/okx.test.ts`：
```ts
import { isOkxInstalled, okxProvider, onAccountsChanged, personalSign, requestAccounts, waitForOkx } from './okx'

const ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'

function installFake() {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
  const fake = {
    request: vi.fn(),
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      ;(listeners[ev] ??= []).push(cb)
    }),
    removeListener: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== cb)
    }),
    emit(ev: string, ...args: unknown[]) {
      for (const cb of listeners[ev] ?? []) cb(...args)
    },
  }
  ;(window as unknown as { okxwallet?: unknown }).okxwallet = fake
  return fake
}

afterEach(() => {
  delete (window as unknown as { okxwallet?: unknown }).okxwallet
  vi.useRealTimers()
})

it('reports not installed and throws on provider access', () => {
  expect(isOkxInstalled()).toBe(false)
  expect(() => okxProvider()).toThrow('未检测到 OKX 钱包')
})

it('requestAccounts returns the checksummed first account', async () => {
  const fake = installFake()
  fake.request.mockResolvedValue([ADDR.toLowerCase()])
  await expect(requestAccounts()).resolves.toBe(ADDR)
  expect(fake.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' })
})

it('requestAccounts rejects when the wallet returns no account', async () => {
  const fake = installFake()
  fake.request.mockResolvedValue([])
  await expect(requestAccounts()).rejects.toThrow('钱包未返回地址')
})

it('personalSign sends the UTF-8 hex of the message and the address', async () => {
  const fake = installFake()
  fake.request.mockResolvedValue('0xsig')
  await expect(personalSign('hi 你好', ADDR)).resolves.toBe('0xsig')
  expect(fake.request).toHaveBeenCalledWith({ method: 'personal_sign', params: ['0x686920e4bda0e5a5bd', ADDR] })
})

it('waitForOkx resolves true once the provider is injected later', async () => {
  vi.useFakeTimers()
  const p = waitForOkx(1000)
  vi.advanceTimersByTime(250)
  installFake()
  vi.advanceTimersByTime(200)
  await expect(p).resolves.toBe(true)
})

it('waitForOkx resolves false after the timeout', async () => {
  vi.useFakeTimers()
  const p = waitForOkx(500)
  vi.advanceTimersByTime(700)
  await expect(p).resolves.toBe(false)
})

it('onAccountsChanged subscribes and the returned function unsubscribes', () => {
  const fake = installFake()
  const cb = vi.fn()
  const off = onAccountsChanged(cb)
  fake.emit('accountsChanged', ['0x1'])
  expect(cb).toHaveBeenCalledWith(['0x1'])
  off()
  fake.emit('accountsChanged', ['0x2'])
  expect(cb).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/wallets`
Expected: 模块不存在，失败。

- [ ] **Step 3: 实现**

`web/src/wallets/okx.ts`：
```ts
import { getAddress, stringToHex } from 'viem'

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, cb: (...args: any[]) => void): void
  removeListener?(event: string, cb: (...args: any[]) => void): void
}

const win = () => globalThis.window as unknown as { okxwallet?: Eip1193 } | undefined

export function isOkxInstalled(): boolean {
  return !!win()?.okxwallet
}

export function okxProvider(): Eip1193 {
  const p = win()?.okxwallet
  if (!p) throw new Error('未检测到 OKX 钱包')
  return p
}

// OKX 的注入晚于页面加载，登录前先轮询等一小会儿。
export function waitForOkx(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    if (isOkxInstalled()) return resolve(true)
    const start = Date.now()
    const id = setInterval(() => {
      if (isOkxInstalled()) {
        clearInterval(id)
        resolve(true)
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(id)
        resolve(false)
      }
    }, 100)
  })
}

export async function requestAccounts(): Promise<string> {
  const accounts = (await okxProvider().request({ method: 'eth_requestAccounts' })) as string[] | undefined
  if (!accounts || accounts.length === 0) throw new Error('钱包未返回地址')
  return getAddress(accounts[0])
}

// EIP-191 personal_sign：消息按 UTF-8 编码成 hex 作为第一个参数，钱包会加 "\x19Ethereum Signed Message:\n<len>" 前缀。
export async function personalSign(message: string, address: string): Promise<string> {
  return (await okxProvider().request({ method: 'personal_sign', params: [stringToHex(message), address] })) as string
}

export function onAccountsChanged(cb: (accounts: string[]) => void): () => void {
  const p = okxProvider()
  p.on?.('accountsChanged', cb)
  return () => p.removeListener?.('accountsChanged', cb)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run src/wallets`
Expected: 7 个测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/wallets
git commit -m "feat(web): OKX 钱包封装（连接、personal_sign、账号变化）"
```

---

### Task 4: 会话 store、登录/登出/动作签名、登录页

**Files:**
- Create: `web/src/features/auth/session.ts`、`web/src/features/auth/auth.ts`、`web/src/features/auth/LoginPage.tsx`
- Test: `web/src/features/auth/auth.test.ts`、`web/src/features/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 `authApi`、`ApiError`；Task 3 `waitForOkx`、`requestAccounts`、`personalSign`、`isOkxInstalled`、`onAccountsChanged`。
- Produces:
```ts
// session.ts
export interface Session { token: string; address: string; role: Role; expiresAt: string }   // address 小写
export const useSession: zustand store { session: Session | null; setSession(s: Session | null): void; setRole(r: Role): void }
export function sessionToken(): string | null
export function clearSession(): void
// auth.ts
export async function loginWithOkx(): Promise<Session>
export async function logout(): Promise<void>
export async function signAction(action: string, params: Record<string, string>): Promise<string>
export async function refreshMe(): Promise<boolean>        // 401/403 → 清会话并返回 false
export function watchAccountChanges(): () => void
// LoginPage.tsx
export default function LoginPage(): JSX.Element            // 登录成功后 navigate(state.from ?? '/', {replace:true})
```

- [ ] **Step 1: 写失败测试**

`web/src/features/auth/auth.test.ts`：
```ts
import { ApiError } from '@/api/client'

vi.mock('@/wallets/okx', () => ({
  isOkxInstalled: vi.fn(() => true),
  waitForOkx: vi.fn(async () => true),
  requestAccounts: vi.fn(async () => '0x8ba1f109551bD432803012645Ac136ddd64DBA72'),
  personalSign: vi.fn(async () => '0xsig'),
  onAccountsChanged: vi.fn(),
}))
vi.mock('@/api/auth', () => ({
  authApi: { nonce: vi.fn(), verify: vi.fn(), logout: vi.fn(), me: vi.fn(), action: vi.fn() },
}))

import { authApi } from '@/api/auth'
import * as okx from '@/wallets/okx'
import { loginWithOkx, logout, refreshMe, signAction, watchAccountChanges } from './auth'
import { clearSession, sessionToken, useSession } from './session'

const ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'

beforeEach(() => {
  clearSession()
  vi.mocked(authApi.nonce).mockResolvedValue({ message: 'siwe-message' })
  vi.mocked(authApi.verify).mockResolvedValue({ token: 'tok', address: ADDR, role: 'admin', expires_at: '2026-09-13T00:00:00Z' })
  vi.mocked(authApi.logout).mockResolvedValue(undefined)
  vi.mocked(authApi.action).mockResolvedValue({ message: 'action-message' })
})

it('loginWithOkx walks nonce → personal_sign → verify and stores a lowercase session', async () => {
  const s = await loginWithOkx()
  expect(authApi.nonce).toHaveBeenCalledWith(ADDR)
  expect(okx.personalSign).toHaveBeenCalledWith('siwe-message', ADDR)
  expect(authApi.verify).toHaveBeenCalledWith(ADDR, '0xsig')
  expect(s).toEqual({ token: 'tok', address: ADDR.toLowerCase(), role: 'admin', expiresAt: '2026-09-13T00:00:00Z' })
  expect(sessionToken()).toBe('tok')
  expect(localStorage.getItem('gofollow.session')).toContain('"token":"tok"')
})

it('loginWithOkx fails fast when the wallet is missing', async () => {
  vi.mocked(okx.waitForOkx).mockResolvedValueOnce(false)
  await expect(loginWithOkx()).rejects.toThrow('未检测到 OKX 钱包，请先安装')
  expect(authApi.nonce).not.toHaveBeenCalled()
})

it('logout clears the session even if the backend call fails', async () => {
  await loginWithOkx()
  vi.mocked(authApi.logout).mockRejectedValueOnce(new ApiError(500, '内部错误'))
  await logout()
  expect(sessionToken()).toBeNull()
})

it('signAction requests a fresh challenge every time and signs with the session address', async () => {
  await loginWithOkx()
  await signAction('export_wallet', { wallet_id: '1' })
  await signAction('export_wallet', { wallet_id: '1' })
  expect(authApi.action).toHaveBeenCalledTimes(2)
  expect(okx.personalSign).toHaveBeenLastCalledWith('action-message', ADDR.toLowerCase())
})

it('signAction refuses without a session', async () => {
  await expect(signAction('export_wallet', { wallet_id: '1' })).rejects.toThrow('未登录')
})

it('refreshMe updates the role and clears the session on 401/403', async () => {
  await loginWithOkx()
  vi.mocked(authApi.me).mockResolvedValueOnce({ address: ADDR.toLowerCase(), role: 'user' })
  await expect(refreshMe()).resolves.toBe(true)
  expect(useSession.getState().session?.role).toBe('user')
  vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError(403, '用户已被锁定'))
  await expect(refreshMe()).resolves.toBe(false)
  expect(sessionToken()).toBeNull()
})

it('refreshMe keeps the session on a network error', async () => {
  await loginWithOkx()
  vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError(0, '无法连接服务'))
  await expect(refreshMe()).resolves.toBe(false)
  expect(sessionToken()).toBe('tok')
})

it('watchAccountChanges logs out when the wallet switches to another address', async () => {
  await loginWithOkx()
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  handler([ADDR])
  expect(sessionToken()).toBe('tok')
  handler(['0x0000000000000000000000000000000000000001'])
  await Promise.resolve()
  expect(sessionToken()).toBeNull()
})
```

`web/src/features/auth/LoginPage.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./auth', () => ({ loginWithOkx: vi.fn() }))
vi.mock('@/wallets/okx', () => ({ isOkxInstalled: vi.fn(() => true) }))

import { loginWithOkx } from './auth'
import { isOkxInstalled } from '@/wallets/okx'
import LoginPage from './LoginPage'

function renderAt(from?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: from ? { from } : undefined }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/wallets" element={<div>钱包页</div>} />
        <Route path="/tasks" element={<div>任务页</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('shows the install hint when OKX is missing', () => {
  vi.mocked(isOkxInstalled).mockReturnValueOnce(false)
  renderAt()
  expect(screen.getByText(/未检测到 OKX 钱包/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /安装 OKX 钱包/ })).toHaveAttribute('href', 'https://www.okx.com/web3')
})

it('logs in and navigates back to where the user came from', async () => {
  vi.mocked(loginWithOkx).mockResolvedValueOnce({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  renderAt('/tasks')
  await userEvent.click(screen.getByRole('button', { name: '连接 OKX 钱包' }))
  expect(await screen.findByText('任务页')).toBeInTheDocument()
})

it('shows the error message when login fails', async () => {
  vi.mocked(loginWithOkx).mockRejectedValueOnce(new Error('账号已被管理员锁定'))
  renderAt()
  await userEvent.click(screen.getByRole('button', { name: '连接 OKX 钱包' }))
  expect(await screen.findByText('账号已被管理员锁定')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/features/auth`
Expected: 模块不存在，失败。

- [ ] **Step 3: 实现**

`web/src/features/auth/session.ts`：
```ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Role } from '@/api/types'

export interface Session {
  token: string
  address: string // 小写
  role: Role
  expiresAt: string
}

interface SessionState {
  session: Session | null
  setSession(s: Session | null): void
  setRole(r: Role): void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      setRole: (role) => set((st) => (st.session ? { session: { ...st.session, role } } : st)),
    }),
    { name: 'gofollow.session', storage: createJSONStorage(() => localStorage) },
  ),
)

export function sessionToken(): string | null {
  return useSession.getState().session?.token ?? null
}

export function clearSession(): void {
  useSession.getState().setSession(null)
}
```

`web/src/features/auth/auth.ts`：
```ts
import { ApiError } from '@/api/client'
import { authApi } from '@/api/auth'
import { isOkxInstalled, onAccountsChanged, personalSign, requestAccounts, waitForOkx } from '@/wallets/okx'
import { clearSession, useSession, type Session } from './session'

// 登录：连接 → 取 SIWE 消息 → personal_sign → 换 token。地址统一小写存会话（后端 owner 也是小写）。
export async function loginWithOkx(): Promise<Session> {
  if (!(await waitForOkx())) throw new Error('未检测到 OKX 钱包，请先安装')
  const address = await requestAccounts()
  const { message } = await authApi.nonce(address)
  const signature = await personalSign(message, address)
  const r = await authApi.verify(address, signature)
  const session: Session = {
    token: r.token,
    address: r.address.toLowerCase(),
    role: r.role === 'admin' ? 'admin' : 'user',
    expiresAt: r.expires_at,
  }
  useSession.getState().setSession(session)
  return session
}

// 登出：后端失败也要清本地会话——用户点了登出就不该还留在登录态。
export async function logout(): Promise<void> {
  try {
    await authApi.logout()
  } catch {
    // ignore
  } finally {
    clearSession()
  }
}

// 动作签名：每次重新要挑战。后端在 409 时也会消耗挑战，缓存签名只会换来"挑战不存在"。
export async function signAction(action: string, params: Record<string, string>): Promise<string> {
  const s = useSession.getState().session
  if (!s) throw new Error('未登录')
  const { message } = await authApi.action(action, params)
  return personalSign(message, s.address)
}

// 启动时校验会话并刷新角色。401/403 清会话；网络错误保留（离线时不把人踢出去）。
export async function refreshMe(): Promise<boolean> {
  try {
    const me = await authApi.me()
    useSession.getState().setRole(me.role === 'admin' ? 'admin' : 'user')
    return true
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clearSession()
    return false
  }
}

// 钱包切换账号：新地址不等于会话地址就登出，避免用 A 的会话操作 B 的钱包。
export function watchAccountChanges(): () => void {
  if (!isOkxInstalled()) return () => {}
  return onAccountsChanged((accounts) => {
    const s = useSession.getState().session
    if (!s) return
    const current = accounts[0]?.toLowerCase()
    if (current !== s.address) void logout()
  })
}
```

`web/src/features/auth/LoginPage.tsx`：
```tsx
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { isOkxInstalled } from '@/wallets/okx'
import { loginWithOkx } from './auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const installed = isOkxInstalled()

  async function onConnect() {
    setBusy(true)
    setError(null)
    try {
      await loginWithOkx()
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">go-follow</h1>
        <p className="mt-2 text-sm text-slate-600">用 OKX 钱包签名登录，钱包地址即账号。签名弹窗里显示的域名应与本页地址一致。</p>
        {!installed && (
          <p className="mt-4 text-sm text-amber-700">
            未检测到 OKX 钱包。请先{' '}
            <a className="underline" href="https://www.okx.com/web3" target="_blank" rel="noreferrer">
              安装 OKX 钱包
            </a>
            ，然后刷新本页。
          </p>
        )}
        <Button className="mt-6 w-full" onClick={onConnect} disabled={busy}>
          {busy ? '等待钱包签名…' : '连接 OKX 钱包'}
        </Button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run typecheck && npm test -- --run src/features/auth`
Expected: 11 个测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/auth
git commit -m "feat(web): 会话 store、OKX 登录/登出/动作签名、登录页"
```

---

### Task 5: 应用壳——路由、守卫、导航、全局横幅、toast、占位页

**Files:**
- Create: `web/src/app/App.tsx`、`web/src/app/Shell.tsx`、`web/src/app/RequireAuth.tsx`、`web/src/app/RequireAdmin.tsx`、`web/src/app/Banner.tsx`、`web/src/app/Placeholder.tsx`、`web/src/app/queryClient.ts`、`web/src/components/ui/toast.tsx`、`web/src/lib/format.ts`
- Modify: `web/src/main.tsx`；Delete: `web/src/App.tsx`、`web/src/App.test.tsx`
- Test: `web/src/app/App.test.tsx`、`web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: Task 2 `configureClient`、`healthApi`、`ApiError`；Task 4 `useSession`、`sessionToken`、`clearSession`、`logout`、`refreshMe`、`watchAccountChanges`、`LoginPage`。
- Produces:
```ts
// toast.tsx
export const toast: { error(msg: string): void; success(msg: string): void; info(msg: string): void }
export function Toaster(): JSX.Element
// format.ts
export function shortAddress(addr: string): string   // 0x1234…abcd
// queryClient.ts
export function makeQueryClient(): QueryClient        // QueryCache/MutationCache onError → toast.error(ApiError.message)，401 不弹
// App.tsx
export default function App(): JSX.Element            // BrowserRouter + Providers + 路由表
export function AppRoutes(): JSX.Element              // 不含 Router，测试用 MemoryRouter 包
```
路由表（计划 B/C 只替换 element）：`/login`；受保护壳下：`/`→重定向 `/wallets`，`/wallets`、`/targets`、`/tasks`、`/positions`、`/decisions`、`/signals`；管理员：`/admin/overview`、`/admin/users`、`/admin/data`、`/admin/audit`；其他 → `/wallets`。

- [ ] **Step 1: 写失败测试**

`web/src/lib/format.test.ts`：
```ts
import { shortAddress } from './format'

it('shortens an address to 6+4', () => {
  expect(shortAddress('0x8ba1f109551bd432803012645ac136ddd64dba72')).toBe('0x8ba1…ba72')
  expect(shortAddress('0xabc')).toBe('0xabc')
})
```

`web/src/app/App.test.tsx`：
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/health', () => ({ healthApi: { get: vi.fn() } }))
vi.mock('@/features/auth/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/features/auth/auth')>()
  return { ...mod, refreshMe: vi.fn(async () => true), watchAccountChanges: vi.fn(() => () => {}), logout: vi.fn() }
})

import { healthApi } from '@/api/health'
import { useSession } from '@/features/auth/session'
import { AppRoutes } from './App'
import { makeQueryClient } from './queryClient'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useSession.getState().setSession(null)
  vi.mocked(healthApi.get).mockResolvedValue({ dry_run: false, kill_switch: false, engine_last_block: 1, node_block: 1 })
})

it('redirects an anonymous visitor to the login page', () => {
  renderAt('/wallets')
  expect(screen.getByRole('button', { name: '连接 OKX 钱包' })).toBeInTheDocument()
})

it('shows the user navigation without the admin group', async () => {
  useSession.getState().setSession({ token: 't', address: '0x8ba1f109551bd432803012645ac136ddd64dba72', role: 'user', expiresAt: '' })
  renderAt('/')
  expect(await screen.findByRole('heading', { name: '钱包' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '跟单' })).toHaveAttribute('href', '/tasks')
  expect(screen.queryByText('管理')).not.toBeInTheDocument()
  expect(screen.getByText('0x8ba1…ba72')).toBeInTheDocument()
})

it('shows the admin group for admins and guards admin routes for users', async () => {
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'admin', expiresAt: '' })
  renderAt('/admin/users')
  expect(await screen.findByRole('heading', { name: '用户' })).toBeInTheDocument()
  expect(screen.getByText('管理')).toBeInTheDocument()

  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  renderAt('/admin/users')
  expect(await screen.findAllByRole('heading', { name: '钱包' })).not.toHaveLength(0)
})

it('shows the global banners from /health', async () => {
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  vi.mocked(healthApi.get).mockResolvedValue({ dry_run: true, kill_switch: true, engine_last_block: 1, node_block: 1 })
  renderAt('/wallets')
  expect(await screen.findByText('已全局停止跟单')).toBeInTheDocument()
  expect(screen.getByText('模拟运行中（dry-run）')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm test -- --run src/app src/lib`
Expected: 模块不存在，失败。

- [ ] **Step 3: 实现**

`web/src/lib/format.ts`：
```ts
export function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
```

`web/src/components/ui/toast.tsx`（自写的最小 toast：zustand 队列 + 固定右上角渲染，4 秒自动消失）：
```tsx
import { create } from 'zustand'
import { cn } from '@/lib/cn'

type Kind = 'error' | 'success' | 'info'
interface Item { id: number; kind: Kind; message: string }
interface ToastState { items: Item[]; push(kind: Kind, message: string): void; remove(id: number): void }

let seq = 0
export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = ++seq
    set((s) => ({ items: [...s.items, { id, kind, message }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 4000)
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  error: (m: string) => useToasts.getState().push('error', m),
  success: (m: string) => useToasts.getState().push('success', m),
  info: (m: string) => useToasts.getState().push('info', m),
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  const remove = useToasts((s) => s.remove)
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {items.map((i) => (
        <div
          key={i.id}
          onClick={() => remove(i.id)}
          className={cn(
            'pointer-events-auto cursor-pointer rounded-md border px-4 py-3 text-sm shadow',
            i.kind === 'error' && 'border-red-200 bg-red-50 text-red-800',
            i.kind === 'success' && 'border-green-200 bg-green-50 text-green-800',
            i.kind === 'info' && 'border-slate-200 bg-white text-slate-800',
          )}
        >
          {i.message}
        </div>
      ))}
    </div>
  )
}
```

`web/src/app/queryClient.ts`：
```ts
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { toast } from '@/components/ui/toast'

// 401 不弹：client 已清会话，路由守卫会把人送回登录页，再弹一条只是噪音。
function report(err: unknown) {
  if (err instanceof ApiError && err.status === 401) return
  toast.error(err instanceof Error ? err.message : '请求失败')
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    // meta.silent 的查询（如 /health 轮询）失败不弹。
    queryCache: new QueryCache({ onError: (err, query) => { if (!query.meta?.silent) report(err) } }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 5_000 } },
  })
}
```

`web/src/app/Placeholder.tsx`：
```tsx
export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">该页面尚未实现。</p>
    </div>
  )
}
```

`web/src/app/RequireAuth.tsx`：
```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/features/auth/session'

export default function RequireAuth() {
  const session = useSession((s) => s.session)
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
```

`web/src/app/RequireAdmin.tsx`：
```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '@/features/auth/session'

export default function RequireAdmin() {
  const role = useSession((s) => s.session?.role)
  if (role !== 'admin') return <Navigate to="/wallets" replace />
  return <Outlet />
}
```

`web/src/app/Banner.tsx`：
```tsx
import { useQuery } from '@tanstack/react-query'
import { healthApi } from '@/api/health'

// /health 是公开接口；10 秒轮询，出错不弹（onError 已在 queryClient 统一处理为 toast，这里用 meta 跳过）。
export default function Banner() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: healthApi.get, refetchInterval: 10_000, meta: { silent: true } })
  if (!data) return null
  return (
    <>
      {data.kill_switch && <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">已全局停止跟单</div>}
      {data.dry_run && <div className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950">模拟运行中（dry-run）</div>}
    </>
  )
}
```
`web/src/app/Shell.tsx`：
```tsx
import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/session'
import { logout, refreshMe, watchAccountChanges } from '@/features/auth/auth'
import { shortAddress } from '@/lib/format'
import { cn } from '@/lib/cn'
import Banner from './Banner'

const userNav = [
  { to: '/wallets', label: '钱包' },
  { to: '/targets', label: '目标' },
  { to: '/tasks', label: '跟单' },
  { to: '/positions', label: '仓位' },
  { to: '/decisions', label: '决策' },
  { to: '/signals', label: '信号' },
]
const adminNav = [
  { to: '/admin/overview', label: '总览' },
  { to: '/admin/users', label: '用户' },
  { to: '/admin/data', label: '全站数据' },
  { to: '/admin/audit', label: '审计' },
]

function Nav({ items }: { items: { to: string; label: string }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.to}>
          <NavLink
            to={i.to}
            className={({ isActive }) =>
              cn('block rounded-md px-3 py-2 text-sm hover:bg-slate-100', isActive && 'bg-slate-200 font-medium')
            }
          >
            {i.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export default function Shell() {
  const session = useSession((s) => s.session)
  useEffect(() => {
    void refreshMe()
    return watchAccountChanges()
  }, [])
  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6 text-lg font-semibold">go-follow</div>
        <Nav items={userNav} />
        {session?.role === 'admin' && (
          <div className="mt-6">
            <div className="mb-1 px-3 text-xs uppercase text-slate-400">管理</div>
            <Nav items={adminNav} />
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Banner />
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <span className="font-mono text-sm text-slate-600">{session ? shortAddress(session.address) : ''}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            登出
          </Button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

`web/src/app/App.tsx`：
```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { useMemo } from 'react'
import LoginPage from '@/features/auth/LoginPage'
import { Toaster } from '@/components/ui/toast'
import Placeholder from './Placeholder'
import RequireAdmin from './RequireAdmin'
import RequireAuth from './RequireAuth'
import Shell from './Shell'
import { makeQueryClient } from './queryClient'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/wallets" replace />} />
          <Route path="/wallets" element={<Placeholder title="钱包" />} />
          <Route path="/targets" element={<Placeholder title="目标" />} />
          <Route path="/tasks" element={<Placeholder title="跟单" />} />
          <Route path="/positions" element={<Placeholder title="仓位" />} />
          <Route path="/decisions" element={<Placeholder title="决策" />} />
          <Route path="/signals" element={<Placeholder title="信号" />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin/overview" element={<Placeholder title="总览" />} />
            <Route path="/admin/users" element={<Placeholder title="用户" />} />
            <Route path="/admin/data" element={<Placeholder title="全站数据" />} />
            <Route path="/admin/audit" element={<Placeholder title="审计" />} />
          </Route>
          <Route path="*" element={<Navigate to="/wallets" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  const client = useMemo(makeQueryClient, [])
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}
```

`web/src/main.tsx` 改为：
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { configureClient } from './api/client'
import { clearSession, sessionToken } from './features/auth/session'
import './index.css'

configureClient({ token: sessionToken, onUnauthorized: clearSession })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```
删除 `web/src/App.tsx` 与 `web/src/App.test.tsx`（Task 1 的占位）。

- [ ] **Step 4: 跑测试与构建**

Run: `cd web && npm run typecheck && npm test -- --run && npm run build`
Expected: 全部 PASS（api 11 + wallets 7 + auth 11 + app 4 + format 1），构建成功。

- [ ] **Step 5: 手工联调（本机有 gofollow 时）**

Run: `cd web && npm run dev`，浏览器开 `http://127.0.0.1:5173`，用 OKX 登录一次，确认进入壳、导航可切换、登出回登录页。gofollow 本机 `config.toml` 的 `[auth] domain="localhost"`、`uri="http://127.0.0.1:8090"` 与 5173 不一致会导致签名弹窗显示的 domain 与页面不同——这是预期（联调阶段后端未按前端地址配置），登录本身仍能成功；正式部署按 README 改。把这一段写进 README 开发章节。

- [ ] **Step 6: 提交**

```bash
git add -A web/src README.md
git commit -m "feat(web): 应用壳——路由、登录守卫、导航、全局横幅、toast、占位页"
```

---

### Task 6: Go 托管服务、构建脚本、app.sh

**Files:**
- Create: `go.mod`、`assets_embed.go`、`assets_dir.go`、`server/server.go`、`server/server_test.go`、`cmd/gofollow-front/main.go`、`Makefile`、`app.sh`
- Modify: `README.md`（构建与运行）

**Interfaces:**
- Produces:
```go
// 根包 gofollowfront
func Assets() (fs.FS, error)                  // embeddist 标签：go:embed web/dist；否则 os.DirFS(WEB_DIST 或 web/dist)
// server
type Config struct { Backend *url.URL; Assets fs.FS }
func New(cfg Config) http.Handler
```

- [ ] **Step 1: go.mod 与资源来源**

`go.mod`：
```
module gofollowfront

go 1.22
```

`assets_embed.go`：
```go
//go:build embeddist

package gofollowfront

import (
	"embed"
	"io/fs"
)

//go:embed all:web/dist
var dist embed.FS

// Assets 返回打进二进制的前端构建产物（make build 用 -tags embeddist）。
func Assets() (fs.FS, error) { return fs.Sub(dist, "web/dist") }
```

`assets_dir.go`：
```go
//go:build !embeddist

package gofollowfront

import (
	"fmt"
	"io/fs"
	"os"
)

// Assets 在未打包时从磁盘目录读（开发/测试用），目录由 WEB_DIST 指定，默认 web/dist。
func Assets() (fs.FS, error) {
	dir := os.Getenv("WEB_DIST")
	if dir == "" {
		dir = "web/dist"
	}
	if _, err := os.Stat(dir + "/index.html"); err != nil {
		return nil, fmt.Errorf("前端产物不存在（%s/index.html）：先 cd web && npm run build，或用 make build 打包", dir)
	}
	return os.DirFS(dir), nil
}
```

- [ ] **Step 2: 写失败测试**

`server/server_test.go`：
```go
package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"testing/fstest"
)

func newTestHandler(t *testing.T, backend http.Handler) (http.Handler, *httptest.Server) {
	t.Helper()
	be := httptest.NewServer(backend)
	t.Cleanup(be.Close)
	u, _ := url.Parse(be.URL)
	assets := fstest.MapFS{
		"index.html":           {Data: []byte("<html>index</html>")},
		"assets/app-abc123.js": {Data: []byte("console.log(1)")},
		"favicon.ico":          {Data: []byte("ico")},
	}
	return New(Config{Backend: u, Assets: assets}), be
}

func get(t *testing.T, h http.Handler, path string, hdr map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.RemoteAddr = "203.0.113.9:1234"
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestProxyStripsPrefixAndForwardsHeaders(t *testing.T) {
	var gotPath, gotAuth, gotXFF, gotProto string
	h, _ := newTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth = r.URL.RequestURI(), r.Header.Get("Authorization")
		gotXFF, gotProto = r.Header.Get("X-Forwarded-For"), r.Header.Get("X-Forwarded-Proto")
		w.WriteHeader(418)
		_, _ = io.WriteString(w, `{"error":"teapot"}`)
	}))
	w := get(t, h, "/api/wallets/3/withdrawals?limit=5", map[string]string{"Authorization": "Bearer tok"})
	if gotPath != "/wallets/3/withdrawals?limit=5" {
		t.Fatalf("path=%q", gotPath)
	}
	if gotAuth != "Bearer tok" || gotXFF != "203.0.113.9" || gotProto != "http" {
		t.Fatalf("headers auth=%q xff=%q proto=%q", gotAuth, gotXFF, gotProto)
	}
	if w.Code != 418 || w.Body.String() != `{"error":"teapot"}` {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestProxyBackendDown502(t *testing.T) {
	h, be := newTestHandler(t, http.NotFoundHandler())
	be.Close()
	w := get(t, h, "/api/health", nil)
	if w.Code != http.StatusBadGateway || w.Body.String() != `{"error":"后端不可用"}` {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("content-type=%q", ct)
	}
}

func TestStaticAssetsAreImmutable(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	w := get(t, h, "/assets/app-abc123.js", nil)
	if w.Code != 200 || w.Body.String() != "console.log(1)" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Fatalf("cache-control=%q", cc)
	}
}

func TestOtherStaticFileServedWithoutLongCache(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	w := get(t, h, "/favicon.ico", nil)
	if w.Code != 200 || w.Body.String() != "ico" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "" {
		t.Fatalf("cache-control=%q", cc)
	}
}

func TestSPAFallback(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	for _, p := range []string{"/", "/wallets", "/admin/users?owner=0xabc", "/assets/missing.js"} {
		w := get(t, h, p, nil)
		if w.Code != 200 || w.Body.String() != "<html>index</html>" {
			t.Fatalf("%s: status=%d body=%s", p, w.Code, w.Body.String())
		}
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("%s: cache-control=%q", p, cc)
		}
	}
}

func TestDirectoryPathFallsBackToIndex(t *testing.T) {
	h, _ := newTestHandler(t, http.NotFoundHandler())
	w := get(t, h, "/assets/", nil)
	if w.Code != 200 || w.Body.String() != "<html>index</html>" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
```

- [ ] **Step 3: 跑测试确认失败**

Run: `go test ./server/`
Expected: `undefined: New`/`Config`，编译失败。

- [ ] **Step 4: 实现 server 与入口**

`server/server.go`：
```go
// Package server 托管前端构建产物并把 /api 反代到 gofollow。
package server

import (
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
)

type Config struct {
	// Backend 是 gofollow 的地址（如 http://127.0.0.1:8090）。
	Backend *url.URL
	// Assets 是前端产物根（含 index.html）。
	Assets fs.FS
}

// New 返回完整的 HTTP handler：/api/* → 反代；其余 → 静态文件或 index.html。
func New(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", newProxy(cfg.Backend))
	mux.Handle("/", newSPA(cfg.Assets))
	return mux
}

func newProxy(backend *url.URL) http.Handler {
	p := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(backend)
			r.SetXForwarded()
			// 去掉 /api 前缀：/api/wallets → /wallets；/api → /
			trimmed := strings.TrimPrefix(r.In.URL.Path, "/api")
			if trimmed == "" {
				trimmed = "/"
			}
			r.Out.URL.Path = trimmed
			r.Out.URL.RawPath = ""
			r.Out.Host = backend.Host
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("proxy %s %s: %v", r.Method, r.URL.Path, err)
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, `{"error":"后端不可用"}`)
		},
	}
	return p
}

type spa struct {
	assets fs.FS
	files  http.Handler
}

func newSPA(assets fs.FS) http.Handler {
	return &spa{assets: assets, files: http.FileServer(http.FS(assets))}
}

func (s *spa) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name != "" && name != "index.html" {
		if st, err := fs.Stat(s.assets, name); err == nil && !st.IsDir() {
			if strings.HasPrefix(name, "assets/") {
				// Vite 产物文件名带内容哈希，可以永久缓存。
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			s.files.ServeHTTP(w, r)
			return
		}
	}
	// 其余路径都是前端路由：回 index.html，且不缓存，发布新版后浏览器立刻拿到新入口。
	b, err := fs.ReadFile(s.assets, "index.html")
	if err != nil {
		http.Error(w, "index.html 缺失", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}
```

`cmd/gofollow-front/main.go`：
```go
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	gofollowfront "gofollowfront"
	"gofollowfront/server"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	listen := env("LISTEN", "0.0.0.0:8080")
	backend, err := url.Parse(env("GOFOLLOW_URL", "http://127.0.0.1:8090"))
	if err != nil || backend.Scheme == "" || backend.Host == "" {
		log.Fatalf("GOFOLLOW_URL 不合法: %q", os.Getenv("GOFOLLOW_URL"))
	}
	assets, err := gofollowfront.Assets()
	if err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{
		Addr:              listen,
		Handler:           server.New(server.Config{Backend: backend, Assets: assets}),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		log.Printf("gofollow-front 监听 %s，后端 %s", listen, backend)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Print("已退出")
}
```

- [ ] **Step 5: 跑测试**

Run: `gofmt -l . ; go vet ./... && go test ./... && go build ./... && go build -tags embeddist -o bin/gofollow-front ./cmd/gofollow-front`
Expected: 6 个测试 PASS；无 tag 的 `go build ./...` 通过；带 tag 的构建需要 `web/dist` 已存在（Task 1 已 `npm run build`），产物 `bin/gofollow-front`。

- [ ] **Step 6: Makefile 与 app.sh**

`Makefile`：
```make
.PHONY: build web-build go-build test clean

build: web-build go-build

web-build:
	cd web && npm ci && npm run build

go-build:
	go build -tags embeddist -o bin/gofollow-front ./cmd/gofollow-front

test:
	cd web && npm run typecheck && npm test -- --run
	go vet ./... && go test ./...

clean:
	rm -rf web/dist bin
```

`app.sh`（`chmod +x`）：
```bash
#!/usr/bin/env bash
# 用法: ./app.sh build|start|stop|restart|status
set -euo pipefail
cd "$(dirname "$0")"
BIN=bin/gofollow-front
PID=bin/gofollow-front.pid
LOG=logs/gofollow-front.log
[ -f .env ] && set -a && . ./.env && set +a

case "${1:-}" in
  build) make build ;;
  start)
    if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "已在运行 pid=$(cat "$PID")"; exit 0; fi
    [ -x "$BIN" ] || { echo "先 ./app.sh build"; exit 1; }
    mkdir -p logs
    nohup "$BIN" >>"$LOG" 2>&1 &
    echo $! >"$PID"
    echo "已启动 pid=$! 日志 $LOG"
    ;;
  stop)
    if [ -f "$PID" ]; then kill "$(cat "$PID")" 2>/dev/null || true; rm -f "$PID"; echo "已停止"; else echo "未运行"; fi
    ;;
  restart) "$0" stop; "$0" start ;;
  status)
    if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "运行中 pid=$(cat "$PID")"; else echo "未运行"; fi
    ;;
  *) echo "用法: $0 build|start|stop|restart|status"; exit 1 ;;
esac
```
把 `logs/` 加进 `.gitignore`。

- [ ] **Step 7: README 构建与运行章节**

`README.md` 追加：
```markdown
## 构建与运行

```bash
cp .env.example .env   # 按需改 LISTEN / GOFOLLOW_URL
./app.sh build         # npm ci && npm run build && go build -tags embeddist
./app.sh start         # 后台运行，日志 logs/gofollow-front.log
./app.sh status | stop | restart
```

不打包时（开发）也可以直接跑 Go 服务从磁盘读产物：`cd web && npm run build && cd .. && go run ./cmd/gofollow-front`（`WEB_DIST` 可改目录）。

测试：`make test`。
```

- [ ] **Step 8: 冒烟与提交**

Run: `./app.sh build && LISTEN=127.0.0.1:18080 ./bin/gofollow-front & sleep 1; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:18080/wallets; curl -s -i http://127.0.0.1:18080/api/health | head -1; kill %1`
Expected: 第一行 `200 text/html; charset=utf-8`；第二行是 gofollow 的 `/health` 应答（本机 gofollow 在跑时 `HTTP/1.1 200`，没跑时 `502`）。

```bash
chmod +x app.sh
git add go.mod assets_embed.go assets_dir.go server cmd Makefile app.sh .gitignore README.md
git commit -m "feat(server): Go 托管服务（embed 静态产物 + /api 反代）、Makefile、app.sh"
```

---

## 自查记录

- **Spec 覆盖**：§2 技术栈与目录（T1、T5、T6）；§3 登录与会话（T3、T4、T5 的 Shell 里 `refreshMe`/`watchAccountChanges`）；§4 API 层与错误映射（T2、T5 的 queryClient 统一 toast）；§5 应用壳、导航、横幅、轮询默认（T5）；§11 Go 服务（T6）；§12 gofollow 侧配置（README，已有）；§13 测试中属于计划 A 的项：client 映射与 401、okx、signAction、路由守卫、Go 代理/回退/缓存头（T2–T6）。策略表单换算、删除钱包 409 组件测试、冒烟脚本属于计划 B/C。
- **占位扫描**：无 TBD；每个页面的 `Placeholder` 是有意的交付物（计划 B/C 替换）。
- **类型一致性**：`Session.role` 用 `Role`（`api/types.ts`）；`configureClient` 的注入在 `main.tsx`；`AppRoutes` 导出供测试；`server.Config`/`New` 与测试一致；根包 `Assets()` 两个 build tag 版本签名相同。
- **已知取舍**：shadcn CLI 暂不引入，只手写 `Button`/toast；`Banner` 用 `meta.silent` 跳过统一 toast。
