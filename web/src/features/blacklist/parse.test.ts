import { parseBlacklistText } from './parse'

const A = '0x1111111111111111111111111111111111111111'

it('parses, dedups (case-insensitive), skips blank lines', () => {
  expect(parseBlacklistText(`${A}\n\n${A.toUpperCase().replace('0X', '0x')}\n`)).toEqual({
    tokens: [A],
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
