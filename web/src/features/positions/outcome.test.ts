import { outcomeTone } from './outcome'

it('maps tones', () => {
  expect(outcomeTone('DRY_RUN')).toBe('green')
  expect(outcomeTone('SKIPPED')).toBe('gray')
  expect(outcomeTone('FAILED')).toBe('red')
  expect(outcomeTone('EXECUTED')).toBe('blue')
})
