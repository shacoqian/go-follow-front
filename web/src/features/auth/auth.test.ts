import { getAddress } from 'viem'
import { ApiError } from '@/api/client'
import type { VerifyResponse } from '@/api/types'

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
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { queryClient } from '@/app/queryClient'
import { authApi } from '@/api/auth'
import { toast } from '@/components/ui/toast'
import { shortAddress } from '@/lib/format'
import * as okx from '@/wallets/okx'
import { loginAs, loginWithOkx, logout, onUnauthorized, refreshMe, resumeOrLogin, runSwitchChain, signAction, switchAccount, watchAccountChanges } from './auth'
import { clearAllSessions, sessionToken, useSession } from './session'

const ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
// 用相对时间，免得测试到了某天因为会话过期突然变红。
const EXPIRES = new Date(Date.now() + 86_400_000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  clearAllSessions()
  vi.mocked(authApi.nonce).mockResolvedValue({ message: 'siwe-message' })
  vi.mocked(authApi.verify).mockResolvedValue({ token: 'tok', address: ADDR, role: 'admin', expires_at: EXPIRES })
  vi.mocked(authApi.logout).mockResolvedValue(undefined)
  vi.mocked(authApi.action).mockResolvedValue({ message: 'action-message' })
})

it('loginWithOkx walks nonce → personal_sign → verify and stores a lowercase session', async () => {
  const s = await loginWithOkx()
  expect(authApi.nonce).toHaveBeenCalledWith(ADDR)
  expect(okx.personalSign).toHaveBeenCalledWith('siwe-message', ADDR)
  expect(authApi.verify).toHaveBeenCalledWith(ADDR, '0xsig')
  expect(s).toEqual({ token: 'tok', address: ADDR.toLowerCase(), role: 'admin', expiresAt: EXPIRES })
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

it('logout clears the query cache so the next account starts empty', async () => {
  const clear = vi.spyOn(queryClient, 'clear')
  await loginWithOkx()
  await logout()
  expect(clear).toHaveBeenCalledTimes(1)
  clear.mockRestore()
})

it('signAction requests a fresh challenge every time and signs with the session address', async () => {
  await loginWithOkx()
  await signAction('export_wallet', { wallet_id: '1' })
  await signAction('export_wallet', { wallet_id: '1' })
  expect(authApi.action).toHaveBeenCalledTimes(2)
  expect(okx.personalSign).toHaveBeenLastCalledWith('action-message', ADDR)
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

const ADDR_B = '0x1234567890123456789012345678901234567890'

it('watchAccountChanges signs in automatically as the new account when the plugin switches', async () => {
  await loginWithOkx()
  const clear = vi.spyOn(queryClient, 'clear')
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  // 插件上报的地址大小写不定，切换时要按 checksum 形式重新签名登录，和其它签名调用保持一致。
  handler([ADDR_B.toLowerCase()])
  await vi.waitFor(() => expect(sessionToken()).toBe('tok-b'))
  expect(authApi.nonce).toHaveBeenLastCalledWith(ADDR_B)
  expect(okx.personalSign).toHaveBeenLastCalledWith('siwe-message', ADDR_B)
  expect(clear).toHaveBeenCalledTimes(1)
  expect(authApi.logout).not.toHaveBeenCalled()
  expect(toast.success).toHaveBeenCalledWith(`已切换到 ${shortAddress(ADDR_B)}`)
  clear.mockRestore()
})

it('watchAccountChanges logs out when auto sign-in after a plugin switch fails', async () => {
  await loginWithOkx()
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  vi.mocked(okx.personalSign).mockRejectedValueOnce(new Error('用户拒绝签名'))
  handler([ADDR_B])
  await vi.waitFor(() => expect(sessionToken()).toBeNull())
  expect(authApi.logout).toHaveBeenCalledTimes(1)
  expect(toast.error).toHaveBeenCalledWith('切换账号失败，请重新登录')
})

it('watchAccountChanges keeps the session when its address is still among the authorized accounts', async () => {
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await loginAs(ADDR_B)
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  vi.mocked(authApi.nonce).mockClear()
  handler([ADDR, ADDR_B])
  expect(sessionToken()).toBe('tok-b')
  expect(authApi.nonce).not.toHaveBeenCalled()
})

it('watchAccountChanges logs out when accountsChanged reports an empty list', async () => {
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await loginAs(ADDR_B)
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  handler([])
  await vi.waitFor(() => expect(sessionToken()).toBeNull())
})

it('watchAccountChanges ignores accountsChanged events fired while switchAccount is in flight', async () => {
  await loginWithOkx()
  vi.mocked(authApi.nonce).mockClear()
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  let resolveVerify: (v: VerifyResponse) => void = () => {}
  vi.mocked(authApi.verify).mockReturnValueOnce(new Promise((resolve) => { resolveVerify = resolve }))
  handler([ADDR_B]) // 触发切到 B，卡在 verify 没回
  // 插件在切换过程中自己也会连着触发同一个 accountsChanged，此时事件应该被锁存（而不是立刻拿去
  // 再跑一次 switchAccount，那样会撞上"切换进行中"直接被拒），不能把还没换完的会话登出。
  handler([ADDR_B])
  expect(sessionToken()).toBe('tok')
  resolveVerify({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await vi.waitFor(() => expect(sessionToken()).toBe('tok-b'))
  // 锁存的那次补跑后，accounts 已经等于当前会话地址，present 检查直接短路，不会再触发一轮切换。
  await vi.waitFor(() => expect(authApi.nonce).toHaveBeenCalledTimes(1))
})

it('logout does not clobber a session that was replaced while awaiting the API', async () => {
  await loginWithOkx()
  let resolveLogout: () => void = () => {}
  vi.mocked(authApi.logout).mockReturnValueOnce(new Promise((resolve) => { resolveLogout = () => resolve(undefined) }))
  const pending = logout()
  // logout 还卡在 await authApi.logout() 的时候，另一条链路（比如 switchAccount）已经把会话换成了 B。
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await loginAs(ADDR_B)
  resolveLogout()
  await pending
  expect(sessionToken()).toBe('tok-b')
  expect(useSession.getState().session?.address).toBe(ADDR_B.toLowerCase())
})

it('loginAs signs in with the given address without calling requestAccounts', async () => {
  const s = await loginAs(ADDR_B)
  expect(okx.requestAccounts).not.toHaveBeenCalled()
  expect(authApi.nonce).toHaveBeenCalledWith(ADDR_B)
  expect(okx.personalSign).toHaveBeenCalledWith('siwe-message', ADDR_B)
  expect(authApi.verify).toHaveBeenCalledWith(ADDR_B, '0xsig')
  expect(s.address).toBe(ADDR.toLowerCase())
})

it('switchAccount logs in as the new address and clears the query cache', async () => {
  await loginWithOkx()
  const clear = vi.spyOn(queryClient, 'clear')
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok2', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B)
  expect(authApi.nonce).toHaveBeenLastCalledWith(ADDR_B)
  expect(useSession.getState().session?.address).toBe(ADDR_B.toLowerCase())
  expect(clear).toHaveBeenCalledTimes(1)
  clear.mockRestore()
})

it('switchAccount leaves the session untouched when signing fails', async () => {
  await loginWithOkx()
  const clear = vi.spyOn(queryClient, 'clear')
  vi.mocked(okx.personalSign).mockRejectedValueOnce(new Error('用户拒绝签名'))
  await expect(switchAccount(ADDR_B)).rejects.toThrow('用户拒绝签名')
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
  expect(clear).not.toHaveBeenCalled()
  clear.mockRestore()
})

it('resumeOrLogin reuses a still-valid saved session and skips signing, but refreshes the role via /auth/me', async () => {
  await loginWithOkx() // 登录 A，缓存 saved[A]，token 是 'tok'
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 登录 B，缓存 saved[A]、saved[B]
  vi.mocked(authApi.nonce).mockClear()
  vi.mocked(okx.personalSign).mockClear()
  vi.mocked(authApi.me).mockResolvedValueOnce({ address: ADDR.toLowerCase(), role: 'admin' })
  const s = await resumeOrLogin(ADDR)
  expect(authApi.me).toHaveBeenCalledWith({ token: 'tok' }) // 拿缓存里的 token 去校验，不是当前会话 B 的 token
  expect(authApi.nonce).not.toHaveBeenCalled()
  expect(okx.personalSign).not.toHaveBeenCalled()
  expect(s.token).toBe('tok') // 用的还是缓存里那个 token，没有重新签名换新 token
  expect(s.role).toBe('admin') // role 以 /auth/me 的返回为准
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
})

it('resumeOrLogin does not publish the cached session until /auth/me confirms it', async () => {
  await loginWithOkx() // 登录 A，缓存 saved[A]
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 当前会话是 B，saved[A]、saved[B] 都在
  let resolveMe: (v: { address: string; role: 'admin' | 'user' }) => void = () => {}
  vi.mocked(authApi.me).mockReturnValueOnce(new Promise((resolve) => { resolveMe = resolve }))
  const p = resumeOrLogin(ADDR)
  // /auth/me 还没回来之前，会话不该被 A 的缓存顶替——挂载中的查询用的还是当前会话 B 的 token，
  // 不能让它们背地里悄悄换了身份。
  expect(useSession.getState().session?.address).toBe(ADDR_B.toLowerCase())
  resolveMe({ address: ADDR.toLowerCase(), role: 'admin' })
  await p
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
})

it('resumeOrLogin forgets a saved session that the backend no longer accepts and signs in again', async () => {
  await loginWithOkx() // 登录 A，缓存 saved[A]
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 登录 B，缓存 saved[A]、saved[B]
  vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError(401, '会话已过期'))
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-a2', address: ADDR, role: 'admin', expires_at: EXPIRES })
  const s = await resumeOrLogin(ADDR)
  expect(authApi.me).toHaveBeenCalledTimes(1)
  expect(authApi.nonce).toHaveBeenLastCalledWith(ADDR)
  expect(okx.personalSign).toHaveBeenLastCalledWith('siwe-message', ADDR)
  expect(s.token).toBe('tok-a2')
  expect(useSession.getState().saved[ADDR.toLowerCase()]?.token).toBe('tok-a2')
})

it('resumeOrLogin forgets and re-signs when /auth/me reports a different address than the one cached', async () => {
  await loginWithOkx() // 登录 A，缓存 saved[A]
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 登录 B，缓存 saved[A]、saved[B]
  // /auth/me 用 A 缓存的 token 查却报回了别的地址（后端认的身份和缓存对不上，当作缓存失效处理）。
  vi.mocked(authApi.me).mockResolvedValueOnce({ address: ADDR_B.toLowerCase(), role: 'user' })
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-a2', address: ADDR, role: 'admin', expires_at: EXPIRES })
  const s = await resumeOrLogin(ADDR)
  expect(authApi.nonce).toHaveBeenLastCalledWith(ADDR)
  expect(s.token).toBe('tok-a2')
  expect(useSession.getState().saved[ADDR.toLowerCase()]?.token).toBe('tok-a2')
})

it('resumeOrLogin signs in directly when there is no saved session for the address', async () => {
  await resumeOrLogin(ADDR_B)
  expect(authApi.me).not.toHaveBeenCalled()
  expect(authApi.nonce).toHaveBeenCalledWith(ADDR_B)
})

it('switchAccount reuses the saved session so switching back does not require a new signature', async () => {
  await loginWithOkx()
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B)
  vi.mocked(authApi.nonce).mockClear()
  vi.mocked(okx.personalSign).mockClear()
  vi.mocked(authApi.me).mockResolvedValueOnce({ address: ADDR.toLowerCase(), role: 'admin' })
  await switchAccount(ADDR)
  expect(authApi.nonce).not.toHaveBeenCalled()
  expect(okx.personalSign).not.toHaveBeenCalled()
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
})

it('logout wipes every cached session, not just the current one', async () => {
  await loginWithOkx()
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B)
  expect(Object.keys(useSession.getState().saved)).toHaveLength(2)
  await logout()
  expect(useSession.getState().saved).toEqual({})
})

it('watchAccountChanges reuses a saved session for the new address without prompting a signature', async () => {
  await loginWithOkx() // 会话 A，缓存 saved[A]
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 会话 B，缓存 saved[A]、saved[B]
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  vi.mocked(authApi.nonce).mockClear()
  vi.mocked(okx.personalSign).mockClear()
  vi.mocked(authApi.me).mockResolvedValueOnce({ address: ADDR.toLowerCase(), role: 'admin' })
  // 插件切回 A，本机还留着 A 上次登录的会话，不该再弹一次签名。
  handler([ADDR])
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(`已切换到 ${shortAddress(ADDR)}`))
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
  expect(authApi.nonce).not.toHaveBeenCalled()
  expect(okx.personalSign).not.toHaveBeenCalled()
})

it('replays a latched accountsChanged event after the in-flight switch settles (A→B→A burst)', async () => {
  await loginWithOkx() // 会话 A，缓存 saved[A]，token 'tok'
  vi.mocked(authApi.nonce).mockClear()
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  let resolveVerify: (v: VerifyResponse) => void = () => {}
  vi.mocked(authApi.verify).mockReturnValueOnce(new Promise((resolve) => { resolveVerify = resolve }))
  // 切回 A 命中缓存，会走 /auth/me 而不是重新签名。
  vi.mocked(authApi.me).mockResolvedValue({ address: ADDR.toLowerCase(), role: 'admin' })

  handler([ADDR_B]) // 插件切到 B，卡在 verify 没回
  handler([ADDR]) // 切换进行中插件又切回了 A——这次事件先被锁存，不能直接丢
  expect(sessionToken()).toBe('tok') // 还没切完，会话仍是 A

  resolveVerify({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES }) // 切到 B 完成
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(`已切换到 ${shortAddress(ADDR_B)}`))

  // 补跑锁存的 [A] 事件：A 的缓存还在，免签直接切回。
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(`已切换到 ${shortAddress(ADDR)}`))
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
  expect(toast.success).toHaveBeenCalledTimes(2) // 两次完整切换各一条 toast，不多不少
  expect(authApi.nonce).toHaveBeenCalledTimes(1) // 只有切到 B 那一次重新签名，切回 A 免签
  expect(authApi.nonce).toHaveBeenCalledWith(ADDR_B)
})

it('rejects a switchAccount call while another one is already in flight', async () => {
  await loginWithOkx()
  vi.mocked(authApi.nonce).mockClear()
  let resolveVerify: (v: VerifyResponse) => void = () => {}
  vi.mocked(authApi.verify).mockReturnValueOnce(new Promise((resolve) => { resolveVerify = resolve }))
  const first = switchAccount(ADDR_B)
  await expect(switchAccount(ADDR_B)).rejects.toThrow('切换进行中，请稍候')
  expect(authApi.nonce).toHaveBeenCalledTimes(1) // 第二次调用被直接拒绝，没有再走一遍 loginAs
  resolveVerify({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await first
  expect(useSession.getState().session?.address).toBe(ADDR_B.toLowerCase())
})

it('onUnauthorized clears only the current session and forgets its own saved copy, leaving other addresses cached', async () => {
  await loginWithOkx() // 会话 A，缓存 saved[A]
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 会话 B，缓存 saved[A]、saved[B]
  onUnauthorized()
  expect(sessionToken()).toBeNull()
  expect(useSession.getState().saved[ADDR_B.toLowerCase()]).toBeUndefined() // 当前地址 B 的缓存被忘掉
  expect(useSession.getState().saved[ADDR.toLowerCase()]?.token).toBe('tok') // 别的地址 A 还留着
})

it('refreshMe forgets the current address\'s saved session on a 403', async () => {
  await loginWithOkx() // 会话 A，缓存 saved[A]
  vi.mocked(authApi.me).mockRejectedValueOnce(new ApiError(403, '用户已被锁定'))
  await expect(refreshMe()).resolves.toBe(false)
  expect(sessionToken()).toBeNull()
  expect(useSession.getState().saved[ADDR.toLowerCase()]).toBeUndefined()
})

it('does not act on a latched event until the failed switch has already logged out (no half-baked login as C)', async () => {
  await loginWithOkx() // 会话 A
  vi.mocked(authApi.nonce).mockClear()
  const ADDR_C = '0xabcdef1234567890abcdef1234567890abcdef12'
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  vi.mocked(okx.personalSign).mockRejectedValueOnce(new Error('用户拒绝签名')) // 切到 B 的签名会失败
  handler([ADDR_B]) // 触发切到 B
  handler([ADDR_C]) // 切换进行中插件又冒出了 C——这次事件先被锁存
  await vi.waitFor(() => expect(sessionToken()).toBeNull())
  // 给补跑（如果错误地发生了）留够时间跑完它自己的异步链路，再做断言。
  await new Promise((resolve) => setTimeout(resolve, 0))
  // 失败先登出（清空会话和全部缓存），锁存的 C 是在 logout() 彻底跑完之后才补跑的——这时
  // handleAccountsChanged 一看会话已经是空的就直接不动了，不会顺着 C 再签一次名登进去，
  // 更不会出现"提示要重新登录，其实已经悄悄用 C 登进去了"这种半吊子状态。只有 B 那一次
  // 签名尝试，checksum(C) 一次都不该出现在 nonce 的调用参数里。
  expect(authApi.nonce).toHaveBeenCalledTimes(1)
  expect(authApi.nonce).toHaveBeenCalledWith(ADDR_B)
  expect(authApi.nonce).not.toHaveBeenCalledWith(getAddress(ADDR_C))
  expect(useSession.getState().session).toBeNull()
  expect(useSession.getState().saved).toEqual({})
})

it('drains a latched event after a manual switch (runSwitchChain, the AccountMenu entry point) settles', async () => {
  await loginWithOkx() // 会话 A
  vi.mocked(authApi.nonce).mockClear()
  const ADDR_C = '0xabcdef1234567890abcdef1234567890abcdef12'
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  let resolveVerify: (v: VerifyResponse) => void = () => {}
  vi.mocked(authApi.verify).mockReturnValueOnce(new Promise((resolve) => { resolveVerify = resolve }))
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-c', address: ADDR_C, role: 'user', expires_at: EXPIRES })
  // 模拟 AccountMenu：手动切到 B，走的是 runSwitchChain，不是裸的 switchAccount。
  const manual = runSwitchChain(ADDR_B)
  // 手动切换进行中，插件又冒出了 C——chainBusy 覆盖的是"整条链路"，手动切换发起的这条也算在内，
  // 这次事件应该被锁存，不能立刻派发（立刻派发会撞上"切换进行中"直接被拒，进而误触发登出）。
  handler([ADDR_C])
  expect(sessionToken()).toBe('tok')
  expect(authApi.nonce).toHaveBeenCalledTimes(1) // 只有 B 那一次，C 还没轮到
  resolveVerify({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await manual
  // 手动切换整条链路（含它自己的 onSuccess，这里没传等于空操作）落定、chainBusy 清掉之后，
  // 才补跑锁存的 [C]：会话现在是 B，C 不在列表里，自动对 C 重新签名登录——顺序是先 B 后 C。
  await vi.waitFor(() => expect(authApi.nonce).toHaveBeenCalledTimes(2))
  expect(authApi.nonce).toHaveBeenNthCalledWith(1, ADDR_B)
  expect(authApi.nonce).toHaveBeenNthCalledWith(2, getAddress(ADDR_C))
})

it('latches (rather than immediately dispatching) an event that arrives during the failure path\'s logout() await', async () => {
  await loginWithOkx() // 会话 A
  vi.mocked(authApi.nonce).mockClear()
  const ADDR_C = '0xabcdef1234567890abcdef1234567890abcdef12'
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  vi.mocked(okx.personalSign).mockRejectedValueOnce(new Error('用户拒绝签名')) // 切到 B 的签名会失败
  let resolveLogout: () => void = () => {}
  vi.mocked(authApi.logout).mockReturnValueOnce(new Promise((resolve) => { resolveLogout = () => resolve(undefined) }))
  handler([ADDR_B]) // 触发切到 B，随后签名失败，失败处理里的 logout() 会卡在 await authApi.logout()
  await vi.waitFor(() => expect(authApi.logout).toHaveBeenCalledTimes(1))
  // 这时 switchAccount 内部早就结束了（inFlight 已经是 null），但 chainBusy 还没清——logout()
  // 还没 await 完。这个事件应该被锁存，不能因为 inFlight 已经是 null 就被当成"没人管"直接派发。
  handler([ADDR_C])
  expect(authApi.nonce).not.toHaveBeenCalledWith(getAddress(ADDR_C))
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase()) // logout() 还没落地，会话原样没动
  resolveLogout()
  await vi.waitFor(() => expect(sessionToken()).toBeNull())
  // logout() 落地、chainBusy 清掉之后才补跑锁存的 C；这时会话已经是空的，补跑直接空转。
  expect(authApi.nonce).not.toHaveBeenCalledWith(getAddress(ADDR_C))
  expect(useSession.getState().session).toBeNull()
})

it('a colliding manual chain does not steal chainBusy ownership from the auto chain actually in flight', async () => {
  await loginWithOkx() // 会话 A
  vi.mocked(authApi.nonce).mockClear()
  const ADDR_C = '0xabcdef1234567890abcdef1234567890abcdef12'
  const ADDR_D = '0x2222222222222222222222222222222222222222'
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  let resolveVerify: (v: VerifyResponse) => void = () => {}
  vi.mocked(authApi.verify).mockReturnValueOnce(new Promise((resolve) => { resolveVerify = resolve }))
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-d', address: ADDR_D, role: 'user', expires_at: EXPIRES })
  handler([ADDR_B]) // 自动切到 B，卡在 verify 没回——chainBusy 归这条自动链路持有
  // 手动切换（AccountMenu 那条路径，同样走 runSwitchChain）撞上正在跑的自动切换：内部的
  // switchAccount(C) 会因为 inFlight 被占用立刻拒绝（跟以前一样），但这次调用绝不能抢走／
  // 提前清掉 chainBusy——chainBusy 仍然归 B 那条链路。
  let manualErr: unknown
  await runSwitchChain(ADDR_C, { onError: (err) => { manualErr = err } })
  expect((manualErr as Error)?.message).toBe('切换进行中，请稍候')
  expect(authApi.nonce).not.toHaveBeenCalledWith(getAddress(ADDR_C))
  // 插件这时又冒出了 D：chainBusy 依然归 B 持有，这次事件应该被锁存，不能直接派发——直接
  // 派发会立刻撞上 inFlight 又被拒绝，进而误判成"切换失败"、多余地登出，即使 B 那条链路
  // 根本没出问题。
  handler([ADDR_D])
  expect(toast.error).not.toHaveBeenCalled()
  expect(authApi.logout).not.toHaveBeenCalled()
  resolveVerify({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(`已切换到 ${shortAddress(ADDR_B)}`))
  // B 落定、chainBusy 清掉之后才补跑锁存的 [D]：会话现在是 B，D 不在列表里，自动对 D 重新签名登录。
  await vi.waitFor(() => expect(authApi.nonce).toHaveBeenCalledWith(getAddress(ADDR_D)))
  expect(toast.error).not.toHaveBeenCalled()
  expect(authApi.logout).not.toHaveBeenCalled()
})
