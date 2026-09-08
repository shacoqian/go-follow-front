import { exitBlockedText, positionInFlight, dryRunLeftover } from './exitState'
import type { Position } from '@/api/positions'
import type { Decision } from '@/api/decisions'

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

const pos = (task_id: number, token: string, updated_at: string): Pick<Position, 'task_id' | 'token' | 'updated_at'> => ({
  task_id,
  token,
  updated_at,
})
const dec = (
  task_id: number,
  token: string,
  outcome: string,
  created_at: string,
): Pick<Decision, 'task_id' | 'token' | 'outcome' | 'created_at'> => ({ task_id, token, outcome, created_at })

it('marks a position in flight only for a newer PENDING/SENT decision on the same task+token', () => {
  expect(positionInFlight(pos(1, '0xAAA', '2026-09-06T00:00:00Z'), [])).toBe(false)
  expect(positionInFlight(pos(1, '0xAAA', '2026-09-06T00:00:00Z'), [dec(1, '0xaaa', 'SKIPPED', '2026-09-07T00:00:00Z')])).toBe(
    false,
  )
  expect(positionInFlight(pos(1, '0xAAA', '2026-09-06T00:00:00Z'), [dec(1, '0xaaa', 'SENT', '2026-09-07T00:00:00Z')])).toBe(
    true,
  )
  // 更新时间比决策还新：已经收尾过了，不在途
  expect(positionInFlight(pos(1, '0xAAA', '2026-09-06T00:00:00Z'), [dec(1, '0xaaa', 'PENDING', '2026-09-05T00:00:00Z')])).toBe(
    false,
  )
  // 同一任务但不同代币：不匹配
  expect(positionInFlight(pos(1, '0xAAA', '2026-09-06T00:00:00Z'), [dec(1, '0xbbb', 'SENT', '2026-09-07T00:00:00Z')])).toBe(
    false,
  )
  // 同一代币但不同任务：不匹配
  expect(positionInFlight(pos(1, '0xAAA', '2026-09-06T00:00:00Z'), [dec(2, '0xaaa', 'SENT', '2026-09-07T00:00:00Z')])).toBe(
    false,
  )
})

it('flags a virtual position as dry-run leftover only once the mode is confirmed live', () => {
  expect(dryRunLeftover({ virtual: true }, true)).toBe(false)
  expect(dryRunLeftover({ virtual: true }, false)).toBe(true)
  expect(dryRunLeftover({ virtual: false }, false)).toBe(false)
  expect(dryRunLeftover({ virtual: true }, undefined)).toBe(false)
})
