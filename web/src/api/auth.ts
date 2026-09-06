import { request } from './client'
import type { Me, VerifyResponse } from './types'

export const authApi = {
  nonce: (address: string) => request<{ message: string }>('POST', '/auth/nonce', { address }),
  verify: (address: string, signature: string) => request<VerifyResponse>('POST', '/auth/verify', { address, signature }),
  logout: () => request<void>('POST', '/auth/logout'),
  // resumeOrLogin 用 opts.token 拿缓存里那个还没 setSession 的候选会话去校验，不影响当前请求头。
  me: (opts?: { token?: string }) => request<Me>('GET', '/auth/me', undefined, opts),
  action: (action: string, params: Record<string, string>) =>
    request<{ message: string }>('POST', '/auth/action', { action, params }),
}
