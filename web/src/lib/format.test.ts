import { shortAddress } from './format'

it('shortens an address to 6+4', () => {
  expect(shortAddress('0x8ba1f109551bd432803012645ac136ddd64dba72')).toBe('0x8ba1…ba72')
  expect(shortAddress('0xabc')).toBe('0xabc')
})
