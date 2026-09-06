import { request } from './client'

export interface Target {
  id: number
  address: string
  label: string
  note: string
  created_at: string
}

export const targetsApi = {
  list: () => request<Target[]>('GET', '/targets'),
  create: (body: { address: string; label: string; note: string }) =>
    request<{ id: number; address: string }>('POST', '/targets', body),
  update: (id: number, body: { label: string; note: string }) => request<void>('PUT', `/targets/${id}`, body),
  remove: (id: number) => request<void>('DELETE', `/targets/${id}`),
}
