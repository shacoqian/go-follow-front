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
