#!/usr/bin/env node
// 端到端冒烟：对着真实 gofollow（经前端反代或直连）用测试私钥完成 SIWE 登录，再走一遍
// 建钱包 → 建目标 → 建任务 → 启停 → 删任务 → 登出。
// 请求路径/字段与 web/src/api/{auth,wallets,targets,tasks,positions,decisions}.ts 保持一致。
//
// 用法：SMOKE_KEY=0x<私钥> BASE=http://127.0.0.1:8080/api node scripts/smoke.mjs
//
// 注意：随机生成的私钥对应地址是普通用户（非管理员），本脚本不调用任何 /admin/* 接口。
// 钱包本身不删：删除钱包需要动作签名（action_signature），脚本不做，见 README「端到端冒烟」一节。
import { privateKeyToAccount } from 'viem/accounts'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080/api'
const KEY = process.env.SMOKE_KEY
if (!KEY) {
  console.error('缺少 SMOKE_KEY')
  process.exit(2)
}
const account = privateKeyToAccount(KEY)
let token = ''

async function call(method, path, body, expect = [200]) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} → ${res.status} ${text}`)
  console.log(`✓ ${method} ${path} → ${res.status}`)
  return data
}

// 登录：POST /auth/nonce {address} → {message}；用 viem 账户对消息做 personal_sign 等价签名；
// POST /auth/verify {address, signature} → {token, address, role, expires_at}（见 web/src/api/auth.ts、types.ts）。
const { message } = await call('POST', '/auth/nonce', { address: account.address })
const signature = await account.signMessage({ message })
const verified = await call('POST', '/auth/verify', { address: account.address, signature })
token = verified.token
const me = await call('GET', '/auth/me')
console.log('  登录为', me.address, me.role)

// 建钱包：POST /wallets {label, note} → {id, address}（web/src/api/wallets.ts）。
const w = await call('POST', '/wallets', { label: `smoke-${Date.now()}`, note: '' })

// 建目标：POST /targets {address, label, note} → {id, address}（web/src/api/targets.ts）。
const tAddr = '0x' + Date.now().toString(16).padStart(40, 'a').slice(-40)
const tg = await call('POST', '/targets', { address: tAddr, label: 'smoke', note: '' })

// 建任务：POST /tasks 携带完整 TaskInput（字段与 web/src/api/tasks.ts 的 TaskInput 一一对应），
// 数值取自策略表单默认值换算后的 bps/最小单位（比例 10%、我方上限 20 USDG、
// 追涨上限 15%、滑点 10%），与 strategySchema.ts 的 defaultStrategy 一致。
const task = await call('POST', '/tasks', {
  wallet_id: w.id,
  target_id: tg.id,
  size_mode: 'ratio',
  size_value: '1000',
  ratio_min_usdg: '0',
  max_per_trade_usdg: '20000000',
  min_target_trade_usdg: '0',
  max_target_trade_usdg: '0',
  max_addon_per_token: 1,
  sell_mode: 'proportional',
  take_profit_bps: 0,
  take_profit_sell_bps: 0,
  stop_loss_bps: 0,
  max_hold_sec: 0,
  max_chase_bps: 1500,
  slippage_bps: 1000,
  retry_max: 2,
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
