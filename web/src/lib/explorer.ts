// 区块浏览器交易页前缀（如 https://explorer.example/tx/）；未配置时返回 null，界面只显示哈希与复制按钮。
export function txUrl(hash: string): string | null {
  const base = import.meta.env.VITE_EXPLORER_BASE as string | undefined
  if (!base) return null
  return base.endsWith('/') ? base + hash : `${base}/${hash}`
}
