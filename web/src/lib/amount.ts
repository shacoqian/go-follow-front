export const USDG_DECIMALS = 6
export const ETH_DECIMALS = 18

const DEC_RE = /^(\d+)(?:\.(\d+))?$/

// 十进制小数字符串 → 最小单位整数字符串。用 BigInt 避免浮点误差；小数位超过 decimals 直接拒绝而不是四舍五入——钱的事不猜。
export function toUnits(amount: string, decimals: number): string {
  if (amount === '') return '0'
  const m = DEC_RE.exec(amount)
  if (!m) throw new Error('金额格式不正确')
  const [, whole, frac = ''] = m
  if (frac.length > decimals) throw new Error('金额格式不正确')
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')).toString()
}

export function fromUnits(units: string | null | undefined, decimals: number, maxFrac = decimals): string {
  if (!units) return '0'
  const neg = units.startsWith('-')
  const abs = neg ? units.slice(1) : units
  const padded = abs.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  const frac = padded
    .slice(padded.length - decimals)
    .slice(0, maxFrac)
    .replace(/0+$/, '')
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '')
}

export const usdgToUnits = (s: string) => toUnits(s, USDG_DECIMALS)
export const unitsToUsdg = (u: string | null | undefined) => fromUnits(u, USDG_DECIMALS)
export const ethToWei = (s: string) => toUnits(s, ETH_DECIMALS)
export const weiToEth = (w: string | null | undefined) => fromUnits(w, ETH_DECIMALS, 6)

export function pctToBps(p: number): number {
  return Math.round(p * 100)
}
export function bpsToPct(b: number): number {
  return b / 100
}
