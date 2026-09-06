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
import { loginAs, loginWithOkx, logout, refreshMe, resumeOrLogin, signAction, switchAccount, watchAccountChanges } from './auth'
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
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(okx.onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  watchAccountChanges()
  let resolveVerify: (v: VerifyResponse) => void = () => {}
  vi.mocked(authApi.verify).mockReturnValueOnce(new Promise((resolve) => { resolveVerify = resolve }))
  const switching = switchAccount(ADDR_B)
  // 插件在切换过程中自己也会连着触发 accountsChanged，此时事件应该被忽略，不能把还没换完的会话登出。
  handler([ADDR_B])
  expect(sessionToken()).toBe('tok')
  resolveVerify({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switching
  expect(sessionToken()).toBe('tok-b')
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
  await loginWithOkx() // 登录 A，缓存 saved[A]
  vi.mocked(authApi.verify).mockResolvedValueOnce({ token: 'tok-b', address: ADDR_B, role: 'user', expires_at: EXPIRES })
  await switchAccount(ADDR_B) // 登录 B，缓存 saved[A]、saved[B]
  vi.mocked(authApi.nonce).mockClear()
  vi.mocked(authApi.me).mockResolvedValueOnce({ address: ADDR.toLowerCase(), role: 'admin' })
  const s = await resumeOrLogin(ADDR)
  expect(authApi.me).toHaveBeenCalledTimes(1)
  expect(authApi.nonce).not.toHaveBeenCalled()
  expect(okx.personalSign).not.toHaveBeenLastCalledWith('siwe-message', ADDR)
  expect(s.token).toBe('tok') // 用的还是缓存里那个 token，没有重新签名换新 token
  expect(s.role).toBe('admin') // role 以 /auth/me 的返回为准
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
  // 插件切回 A，本机还留着 A 上次登录的会话，不该再弹一次签名。setSession(saved) 会在
  // /auth/me 校验完成前就同步把会话地址切过去，所以这里等的是切换流程真正走完的信号
  // （toast），而不是提前满足的会话地址。
  handler([ADDR])
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(`已切换到 ${shortAddress(ADDR)}`))
  expect(useSession.getState().session?.address).toBe(ADDR.toLowerCase())
  expect(authApi.nonce).not.toHaveBeenCalled()
  expect(okx.personalSign).not.toHaveBeenCalled()
})
