import { exitBlockedText } from './exitState'
import type { Position } from '@/api/positions'

const base = {
  id: 1,
  task_id: 1,
  token: '0xt',
  qty: '10',
  cost_usdg: '0',
  avg_price_usdg: 0,
  addon_count: 0,
  tp_done: false,
  realized_usdg: '0',
  virtual: true,
  updated_at: '',
} as Position

it('formats blocked state', () => {
  expect(exitBlockedText({ ...base, exit_fail_count: 0, last_exit_error: '', next_exit_at: null })).toBeNull()
  const s = exitBlockedText({ ...base, exit_fail_count: 3, last_exit_error: 'no_route', next_exit_at: '2026-09-06T04:34:00Z' })
  expect(s).toMatch(/^退出受阻：no_route，连续 3 次，下次尝试 \d{2}:\d{2}$/)
  expect(exitBlockedText({ ...base, exit_fail_count: 1, last_exit_error: 'quote_failed', next_exit_at: null })).toBe(
    '退出受阻：quote_failed，连续 1 次',
  )
})
