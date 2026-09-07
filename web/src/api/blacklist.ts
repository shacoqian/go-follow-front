import { request } from './client'

export interface BlacklistResult {
  tokens: string[]
  warning?: string
}

export const blacklistApi = {
  get: () => request<BlacklistResult>('GET', '/settings/blacklist', undefined),
  put: (tokens: string[]) => request<BlacklistResult>('PUT', '/settings/blacklist', { tokens }),
}
