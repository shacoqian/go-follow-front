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
  // 每个地址最近一次登录成功的会话，key 是小写地址。切回某个用过的地址时先查这里，
  // 命中且还没过期就不用再弹一次签名。老版本本地数据没有这个字段，persist 默认合并
  // 时会保留这里的初始值 {}，不需要额外的版本迁移。
  saved: Record<string, Session>
  setSession(s: Session | null): void
  setRole(r: Role): void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      saved: {},
      setSession: (session) =>
        set((st) => ({
          session,
          // 只有真正设置一个会话时才记忆下来；传 null（比如 clearSession）只清当前显示的会话，
          // 不动 saved——不然别的地址切回来的时候还没登出就白白丢了免签的机会。
          saved: session ? { ...st.saved, [session.address]: session } : st.saved,
        })),
      setRole: (role) => set((st) => (st.session ? { session: { ...st.session, role } } : st)),
    }),
    { name: 'gofollow.session', storage: createJSONStorage(() => localStorage) },
  ),
)

// 会话是否还可用：过期时间能解析且已到期就作废。解析不出来当作有效——
// 后端才是权威，本地不该因为一个格式外的字段把人踢下线。
export function sessionValid(s: Session | null): boolean {
  if (!s) return false
  const exp = Date.parse(s.expiresAt)
  if (Number.isNaN(exp)) return true
  return exp > Date.now()
}

export function sessionToken(): string | null {
  const s = useSession.getState().session
  return sessionValid(s) ? (s?.token ?? null) : null
}

export function clearSession(): void {
  useSession.getState().setSession(null)
}

// 缓存里某个地址的会话，只在还没过期时才给——过期的顺手删掉，免得下次又白查一次
// （后端 TTL 内没过期也不代表后端一定还认，调用方（resumeOrLogin）仍要用 /auth/me 校验一遍）。
export function savedSession(address: string): Session | null {
  const key = address.toLowerCase()
  const s = useSession.getState().saved[key]
  if (!s) return null
  if (sessionValid(s)) return s
  forgetSession(key)
  return null
}

// 单独忘掉一个地址的缓存（比如它被后端拒绝了），不影响当前会话或其它地址。
export function forgetSession(address: string): void {
  const key = address.toLowerCase()
  useSession.setState((st) => {
    if (!(key in st.saved)) return st
    const saved = { ...st.saved }
    delete saved[key]
    return { saved }
  })
}

// 用户主动登出：当前会话和所有地址的缓存一起清——登出就该是登出，不留后门让下次切换免签。
export function clearAllSessions(): void {
  useSession.setState({ session: null, saved: {} })
}
