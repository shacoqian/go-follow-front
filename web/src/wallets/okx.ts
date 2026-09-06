import { getAddress, stringToHex } from 'viem'

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, cb: (...args: any[]) => void): void
  removeListener?(event: string, cb: (...args: any[]) => void): void
}

const win = () => globalThis.window as unknown as { okxwallet?: Eip1193 } | undefined

export function isOkxInstalled(): boolean {
  return !!win()?.okxwallet
}

export function okxProvider(): Eip1193 {
  const p = win()?.okxwallet
  if (!p) throw new Error('未检测到 OKX 钱包')
  return p
}

// OKX 的注入晚于页面加载，登录前先轮询等一小会儿。
export function waitForOkx(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    if (isOkxInstalled()) return resolve(true)
    const start = Date.now()
    const id = setInterval(() => {
      if (isOkxInstalled()) {
        clearInterval(id)
        resolve(true)
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(id)
        resolve(false)
      }
    }, 100)
  })
}

export async function requestAccounts(): Promise<string> {
  const accounts = (await okxProvider().request({ method: 'eth_requestAccounts' })) as string[] | undefined
  if (!accounts || accounts.length === 0) throw new Error('钱包未返回地址')
  return getAddress(accounts[0])
}

// EIP-191 personal_sign：消息按 UTF-8 编码成 hex 作为第一个参数，钱包会加 "\x19Ethereum Signed Message:\n<len>" 前缀。
export async function personalSign(message: string, address: string): Promise<string> {
  return (await okxProvider().request({ method: 'personal_sign', params: [stringToHex(message), address] })) as string
}

export function onAccountsChanged(cb: (accounts: string[]) => void): () => void {
  const p = okxProvider()
  p.on?.('accountsChanged', cb)
  return () => p.removeListener?.('accountsChanged', cb)
}
