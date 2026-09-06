import { bpsToPct, ethToWei, fromUnits, pctToBps, toUnits, unitsToUsdg, usdgToUnits, weiToEth } from './amount'

describe('toUnits', () => {
  it.each([
    ['12.5', 6, '12500000'],
    ['0.000001', 6, '1'],
    ['100', 6, '100000000'],
    ['0', 6, '0'],
    ['', 6, '0'],
    ['1.5', 18, '1500000000000000000'],
  ])('%s with %i decimals → %s', (s, d, want) => expect(toUnits(s, d)).toBe(want))
  it.each(['abc', '1.2.3', '-1', '0.0000001', ' 1'])('rejects %s', (s) => expect(() => toUnits(s, 6)).toThrow('金额格式不正确'))
})

describe('fromUnits', () => {
  it.each([
    ['12500000', 6, undefined, '12.5'],
    ['1', 6, undefined, '0.000001'],
    ['100000000', 6, undefined, '100'],
    ['0', 6, undefined, '0'],
    [null, 6, undefined, '0'],
    ['1234567890123456789', 18, 6, '1.234567'],
  ])('%s → %s', (u, d, f, want) => expect(fromUnits(u as string | null, d, f)).toBe(want))
})

it('usdg / eth helpers and bps', () => {
  expect(usdgToUnits('3')).toBe('3000000')
  expect(unitsToUsdg('3000000')).toBe('3')
  expect(ethToWei('0.0001')).toBe('100000000000000')
  expect(weiToEth('100000000000000')).toBe('0.0001')
  expect(pctToBps(12.5)).toBe(1250)
  expect(pctToBps(0.01)).toBe(1)
  expect(bpsToPct(1250)).toBe(12.5)
})
