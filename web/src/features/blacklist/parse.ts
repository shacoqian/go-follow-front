import { getAddress, isAddress } from 'viem'

const MAX_TOKENS = 500

export function parseBlacklistText(text: string): { tokens: string[]; error: string | null } {
  const lines = text.split('\n')
  const seen = new Set<string>()
  const tokens: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (!isAddress(line, { strict: false })) return { tokens: [], error: `第 ${i + 1} 行不是合法地址` }
    const lower = getAddress(line).toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      tokens.push(lower)
    }
  }
  if (tokens.length > MAX_TOKENS) return { tokens: [], error: '最多 500 条' }
  return { tokens, error: null }
}
