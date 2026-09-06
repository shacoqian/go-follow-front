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

// eth_accounts 不弹窗，只回已经授权过本站的地址；未安装/出错都当作"没有账号"，调用方据此回退到连接流程。
export async function listAccounts(): Promise<string[]> {
  if (!isOkxInstalled()) return []
  try {
    const accounts = (await okxProvider().request({ method: 'eth_accounts' })) as string[] | undefined
    return (accounts ?? []).map((a) => getAddress(a))
  } catch {
    return []
  }
}

// 部分钱包/RPC 转发层不认识某个方法时会用 4200（unsupported method）或 -32601（method not found）
// 之类的错误码，或者在 message 里写 "method not supported" / "method not found" / "unsupported method"
// 这几种措辞之一——都当作"不支持"处理。
function isUnsupportedMethodError(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? (e as { code?: unknown }).code : undefined
  if (code === 4200 || code === -32601) return true
  const message = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message) : ''
  return /method (not (supported|found))|unsupported method/i.test(message)
}

// 弹插件的账号勾选框，让用户追加/取消对本站的授权。用户在弹窗里点了拒绝（4001）要把错误抛出去，
// 由调用方展示失败；插件根本不认识这个方法则当作"不支持"，返回 false 由调用方隐藏入口。
export async function requestPermissions(): Promise<boolean> {
  try {
    await okxProvider().request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
    return true
  } catch (e) {
    if (isUnsupportedMethodError(e)) return false
    throw e
  }
}

// EIP-2255 的 wallet_getPermissions 不是所有钱包都实现；探测它是否可用来判断能不能显示
// "管理授权账号…" 入口。没装钱包时直接当不支持处理；探测本身失败但看不出是"不支持"信号时，
// 保守返回 true——真出问题会在用户点击 requestPermissions 时再暴露，交给那里的错误处理。
export async function supportsRequestPermissions(): Promise<boolean> {
  if (!isOkxInstalled()) return false
  try {
    await okxProvider().request({ method: 'wallet_getPermissions' })
    return true
  } catch (e) {
    if (isUnsupportedMethodError(e)) return false
    return true
  }
}
