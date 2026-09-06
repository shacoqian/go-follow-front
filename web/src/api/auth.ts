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
