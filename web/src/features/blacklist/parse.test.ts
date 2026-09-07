import { getAddress } from 'viem'
import { parseBlacklistText } from './parse'

const A = '0x1111111111111111111111111111111111111111'
const L = '0xabcdef0123456789abcdef0123456789abcdef01'

it('parses, dedups case-insensitively across lowercase/checksummed/all-uppercase forms, skips blank lines', () => {
  const checksummed = getAddress(L)
  const upper = L.toUpperCase().replace('0X', '0x')
  expect(parseBlacklistText(`${L}\n\n${checksummed}\n${upper}\n`)).toEqual({
    tokens: [L],
    error: null,
  })
})

it('reports the original line number of an invalid address', () => {
  expect(parseBlacklistText(`${A}\n\nnope`).error).toBe('第 3 行不是合法地址')
})

it('caps at 500', () => {
  const many = Array.from({ length: 501 }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0')).join('\n')
  expect(parseBlacklistText(many).error).toBe('最多 500 条')
})
