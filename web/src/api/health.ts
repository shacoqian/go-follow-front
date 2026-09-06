import { request } from './client'
import type { Health } from './types'

export const healthApi = {
  get: () => request<Health>('GET', '/health'),
}
