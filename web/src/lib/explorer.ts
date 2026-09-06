// 区块浏览器交易页/地址页前缀（如 https://explorer.example/tx/）；未配置时返回 null，界面只显示哈希/地址与复制按钮。
function join(base: string | undefined, id: string): string | null {
  if (!base) return null
  return base.endsWith('/') ? base + id : `${base}/${id}`
}

export function txUrl(hash: string): string | null {
  return join(import.meta.env.VITE_EXPLORER_BASE, hash)
}

export function addressUrl(addr: string): string | null {
  return join(import.meta.env.VITE_EXPLORER_ADDRESS_BASE, addr)
}
