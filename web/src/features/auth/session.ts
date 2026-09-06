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
