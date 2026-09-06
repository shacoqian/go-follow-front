export function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// avg_price_usdg / quoted_price_usdg 是浮点数，最多展示 6 位小数并去掉多余的尾随 0。
export function fmtPrice(n: number): string {
  return n.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
