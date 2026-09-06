import { request } from './client'
import { qs } from './query'

export interface Signal {
  id: number
  block: number
  tx_hash: string
  target_addr: string
  side: 'BUY' | 'SELL'
  token: string
  token_amount: string
  quote_asset: string
  quote_amount: string
  quote_token: string
  venue: string
  venue_addr: string
  target_balance_before: string | null
  target_balance_after: string | null
  fill_price_usdg: number
  seen_at: string
}

export const signalsApi = {
  list: (p: { target?: string; since?: string; limit: number }) =>
    request<Signal[]>('GET', `/signals${qs({ target: p.target, since: p.since, limit: p.limit })}`, undefined),
}
