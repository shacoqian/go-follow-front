import { fmtPrice, fmtTime, shortAddress } from './format'

it('shortens an address to 6+4', () => {
  expect(shortAddress('0x8ba1f109551bd432803012645ac136ddd64dba72')).toBe('0x8ba1…ba72')
  expect(shortAddress('0xabc')).toBe('0xabc')
})

it('formats a price to at most 6 decimals with trailing zeros trimmed', () => {
  expect(fmtPrice(100 / 3)).toBe('33.333333')
  expect(fmtPrice(23809.5)).toBe('23809.5')
  expect(fmtPrice(100)).toBe('100')
})

it('formats time in local zone and dashes empty', () => {
  expect(fmtTime(null)).toBe('—')
  expect(fmtTime('')).toBe('—')
  expect(fmtTime('2026-09-06T08:41:24.800Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
})
