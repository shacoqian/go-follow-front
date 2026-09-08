import { outcomeTone, fillSummary, reasonBadgeLabel } from './outcome'
import type { Decision } from '@/api/decisions'

it('maps tones', () => {
  expect(outcomeTone('DRY_RUN')).toBe('green')
  expect(outcomeTone('SKIPPED')).toBe('gray')
  expect(outcomeTone('FAILED')).toBe('red')
  expect(outcomeTone('EXECUTED')).toBe('green')
  expect(outcomeTone('SENT')).toBe('blue')
  expect(outcomeTone('PENDING')).toBe('blue')
})

it('summarizes fills by side, dashing out unfilled decisions', () => {
  const base: Pick<Decision, 'side' | 'filled_in' | 'filled_out'> = { side: 'BUY', filled_in: '0', filled_out: '0' }
  expect(fillSummary(base)).toBe('—')
  expect(fillSummary({ side: 'BUY', filled_in: '9000000', filled_out: '123456' })).toBe('花 9 USDG 得 123456')
  expect(fillSummary({ side: 'SELL', filled_in: '123456', filled_out: '9000000' })).toBe('花 123456 得 9 USDG')
})

it('flags the capped reason without touching skip semantics', () => {
  expect(reasonBadgeLabel('capped')).toBe('已截断')
  expect(reasonBadgeLabel('daily_cap')).toBeNull()
  expect(reasonBadgeLabel('')).toBeNull()
})
