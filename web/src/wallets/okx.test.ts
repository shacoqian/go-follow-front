import { isOkxInstalled, okxProvider, onAccountsChanged, personalSign, requestAccounts, waitForOkx } from './okx'

const ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'

function installFake() {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
  const fake = {
    request: vi.fn(),
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      ;(listeners[ev] ??= []).push(cb)
    }),
    removeListener: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== cb)
    }),
    emit(ev: string, ...args: unknown[]) {
      for (const cb of listeners[ev] ?? []) cb(...args)
    },
  }
  ;(window as unknown as { okxwallet?: unknown }).okxwallet = fake
  return fake
}

afterEach(() => {
  delete (window as unknown as { okxwallet?: unknown }).okxwallet
  vi.useRealTimers()
})

it('reports not installed and throws on provider access', () => {
  expect(isOkxInstalled()).toBe(false)
  expect(() => okxProvider()).toThrow('未检测到 OKX 钱包')
})

it('requestAccounts returns the checksummed first account', async () => {
  const fake = installFake()
  fake.request.mockResolvedValue([ADDR.toLowerCase()])
  await expect(requestAccounts()).resolves.toBe(ADDR)
  expect(fake.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' })
})

it('requestAccounts rejects when the wallet returns no account', async () => {
  const fake = installFake()
  fake.request.mockResolvedValue([])
  await expect(requestAccounts()).rejects.toThrow('钱包未返回地址')
})

it('personalSign sends the UTF-8 hex of the message and the address', async () => {
  const fake = installFake()
  fake.request.mockResolvedValue('0xsig')
  await expect(personalSign('hi 你好', ADDR)).resolves.toBe('0xsig')
  expect(fake.request).toHaveBeenCalledWith({ method: 'personal_sign', params: ['0x686920e4bda0e5a5bd', ADDR] })
})

it('waitForOkx resolves true once the provider is injected later', async () => {
  vi.useFakeTimers()
  const p = waitForOkx(1000)
  vi.advanceTimersByTime(250)
  installFake()
  vi.advanceTimersByTime(200)
  await expect(p).resolves.toBe(true)
})

it('waitForOkx resolves false after the timeout', async () => {
  vi.useFakeTimers()
  const p = waitForOkx(500)
  vi.advanceTimersByTime(700)
  await expect(p).resolves.toBe(false)
})

it('onAccountsChanged subscribes and the returned function unsubscribes', () => {
  const fake = installFake()
  const cb = vi.fn()
  const off = onAccountsChanged(cb)
  fake.emit('accountsChanged', ['0x1'])
  expect(cb).toHaveBeenCalledWith(['0x1'])
  off()
  fake.emit('accountsChanged', ['0x2'])
  expect(cb).toHaveBeenCalledTimes(1)
})
