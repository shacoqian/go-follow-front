import { addressUrl, txUrl } from './explorer'

it('returns null without config', () => {
  vi.stubEnv('VITE_EXPLORER_BASE', '')
  vi.stubEnv('VITE_EXPLORER_ADDRESS_BASE', '')
  expect(txUrl('0xh')).toBeNull()
  expect(addressUrl('0xa')).toBeNull()
})

it('joins with or without trailing slash', () => {
  vi.stubEnv('VITE_EXPLORER_BASE', 'https://e/tx/')
  vi.stubEnv('VITE_EXPLORER_ADDRESS_BASE', 'https://e/address')
  expect(txUrl('0xh')).toBe('https://e/tx/0xh')
  expect(addressUrl('0xa')).toBe('https://e/address/0xa')
  vi.unstubAllEnvs()
})
