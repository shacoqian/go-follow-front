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

const dec = (outcome: string, created_at: string): Pick<Decision, 'outcome' | 'created_at'> => ({ outcome, created_at })

it('marks a position in flight only when a newer PENDING/SENT decision exists for the task', () => {
  expect(positionInFlight({ updated_at: '2026-09-06T00:00:00Z' }, [])).toBe(false)
  expect(positionInFlight({ updated_at: '2026-09-06T00:00:00Z' }, [dec('SKIPPED', '2026-09-07T00:00:00Z')])).toBe(false)
  expect(positionInFlight({ updated_at: '2026-09-06T00:00:00Z' }, [dec('SENT', '2026-09-07T00:00:00Z')])).toBe(true)
  expect(positionInFlight({ updated_at: '2026-09-06T00:00:00Z' }, [dec('PENDING', '2026-09-05T00:00:00Z')])).toBe(false)
})

it('flags a virtual position as dry-run leftover only once the mode is confirmed live', () => {
  expect(dryRunLeftover({ virtual: true }, true)).toBe(false)
  expect(dryRunLeftover({ virtual: true }, false)).toBe(true)
  expect(dryRunLeftover({ virtual: false }, false)).toBe(false)
  expect(dryRunLeftover({ virtual: true }, undefined)).toBe(false)
})
