import { request, requestFull, type Reply } from './client'

export interface Wallet {
  id: number
  address: string
  label: string
  note: string
  status: 'active' | 'disabled'
  usdg_balance: string | null
  eth_balance: string | null
  balance_error?: string
  task_count: number
  has_pending_withdrawal: boolean
  created_at: string
}

export interface Withdrawal {
  id: number
  wallet_id: number
  asset: 'USDG' | 'ETH'
  amount: string
  to_addr: string
  status: 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED'
  error: string
  tx_hash: string
  created_at: string
  updated_at: string
}

export interface WithdrawResult {
  id: number
  tx_hash: string
  status: string
  note?: string
}

export const walletsApi = {
  list: () => request<Wallet[]>('GET', '/wallets', undefined),
  create: (body: { label: string; note: string }) => request<{ id: number; address: string }>('POST', '/wallets', body),
  update: (id: number, body: { label: string; note: string }) => request<void>('PUT', `/wallets/${id}`, body),
  disable: (id: number) => request<void>('POST', `/wallets/${id}/disable`, undefined),
  exportKey: (id: number, signature: string) =>
    request<{ address: string; wallet_key: string }>(
      'GET',
      `/wallets/${id}/export?action_signature=${encodeURIComponent(signature)}`,
      undefined,
    ),
  remove: (id: number, signature: string, force: boolean) =>
    request<void>(
      'DELETE',
      `/wallets/${id}?action_signature=${encodeURIComponent(signature)}&force=${force ? 1 : 0}`,
      undefined,
    ),
  withdraw: (id: number, body: { asset: 'USDG' | 'ETH'; amount: string }): Promise<Reply<WithdrawResult>> =>
    requestFull<WithdrawResult>('POST', `/wallets/${id}/withdraw`, body),
  withdrawals: (id: number) => request<Withdrawal[]>('GET', `/wallets/${id}/withdrawals`, undefined),
}

export const withdrawalsApi = {
  get: (id: number) => request<Withdrawal>('GET', `/withdrawals/${id}`, undefined),
}
