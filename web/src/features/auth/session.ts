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
