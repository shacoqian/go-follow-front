import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { getAddress } from 'viem'

// isSwitchBusy/subscribeSwitchBusy 的可控假实现：hoisted 出来，测试用例里直接改 busyState.busy
// 再逐个调用 listeners，模拟 auth.ts 的 chainBusy 从无到有/从有到无（不一定是这个组件自己的
// mutation 触发的，也可能是插件自动切换那条链路）。
const busyState = vi.hoisted(() => ({ busy: false, listeners: new Set<() => void>() }))

vi.mock('@/features/auth/auth', () => ({
  runSwitchChain: vi.fn(),
  isSwitchBusy: vi.fn(() => busyState.busy),
  subscribeSwitchBusy: vi.fn((cb: () => void) => {
    busyState.listeners.add(cb)
    return () => busyState.listeners.delete(cb)
  }),
}))
vi.mock('@/features/auth/useOkxAccounts', () => ({ useOkxAccounts: vi.fn() }))
vi.mock('@/wallets/okx', () => ({ requestPermissions: vi.fn(), supportsRequestPermissions: vi.fn(async () => true) }))

import { runSwitchChain } from '@/features/auth/auth'
import { useOkxAccounts } from '@/features/auth/useOkxAccounts'
import { requestPermissions, supportsRequestPermissions } from '@/wallets/okx'
import { useSession } from '@/features/auth/session'
import { ApiError } from '@/api/client'
import { shortAddress } from '@/lib/format'
import { useToasts, Toaster } from '@/components/ui/toast'
import { makeQueryClient } from './queryClient'
import AccountMenu from './AccountMenu'

const A = '0x8ba1f109551bd432803012645ac136ddd64dba72'
const B = '0x1234567890123456789012345678901234567890'
// 用相对时间，免得测试到了某天因为过期时间点凑巧撞上而变红。
const VALID = new Date(Date.now() + 86_400_000).toISOString()
const EXPIRED = new Date(Date.now() - 86_400_000).toISOString()

type Handlers = { onSuccess?: () => void | Promise<void>; onError?: (err: unknown) => void | Promise<void> }

// runSwitchChain 真身会自己调用传进去的 onSuccess/onError；mock 里也得照做，
// 不然 AccountMenu 传的那两个 callback（toast、下拉退回原地址）永远不会被触发。
function mockSucceeds() {
  vi.mocked(runSwitchChain).mockImplementationOnce(async (_address: string, handlers?: Handlers) => {
    await handlers?.onSuccess?.()
  })
}

function mockFails(err: unknown) {
  vi.mocked(runSwitchChain).mockImplementationOnce(async (_address: string, handlers?: Handlers) => {
    await handlers?.onError?.(err)
  })
}

function renderMenu() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <AccountMenu />
      <Toaster />
    </QueryClientProvider>,
  )
}

// 往 saved 里加一条本机记住的会话（不走真正的登录流程），模拟"这个地址以前登录过"。
function addSaved(address: string, expiresAt: string) {
  act(() => {
    useSession.setState((st) => ({
      saved: { ...st.saved, [address]: { token: 'tok', address, role: 'user' as const, expiresAt } },
    }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  busyState.busy = false
  busyState.listeners.clear()
  useToasts.setState({ items: [] })
  // saved 是持久化的 zustand store，不会随 afterEach 的 setSession(null) 清空（那只清当前会话，
  // 是有意为之，见 session.ts）——每个用例开始前显式清一遍，不然上一个用例 addSaved() 加的
  // 地址会串进下一个用例的下拉。
  useSession.setState({ saved: {} })
  useSession.getState().setSession({ token: 't', address: A, role: 'user', expiresAt: VALID })
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [], current: A, refresh: vi.fn(async () => {}) })
  vi.mocked(supportsRequestPermissions).mockResolvedValue(true)
})

afterEach(() => {
  act(() => {
    useSession.getState().setSession(null)
  })
})

it('lists the session address plus every remembered account, flagging expired ones', async () => {
  addSaved(B, EXPIRED)
  renderMenu()
  const select = await screen.findByLabelText('账号')
  expect(select).toHaveValue(A)
  expect(screen.getByRole('option', { name: shortAddress(A) })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: `${shortAddress(B)}（需重新签名）` })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: '切换账号…' })).toBeInTheDocument()
})

it('lists the plugin current address even when it has never been saved, labeling it accordingly', async () => {
  const C = '0xabcdef1234567890abcdef1234567890abcdef12'
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [], current: C, refresh: vi.fn(async () => {}) })
  renderMenu()
  await screen.findByLabelText('账号')
  expect(screen.getByRole('option', { name: `${shortAddress(C.toLowerCase())}（插件当前）` })).toBeInTheDocument()
})

it('switches to a saved account without a fresh signature and shows a toast', async () => {
  addSaved(B, VALID)
  mockSucceeds()
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(runSwitchChain).toHaveBeenCalledWith(B, expect.any(Object))
  expect(await screen.findByText(`已切换到 ${shortAddress(B)}`)).toBeInTheDocument()
  expect(select).toHaveValue(B)
})

it('reverts to the session address and toasts an error when switching fails', async () => {
  addSaved(B, VALID)
  mockFails(new Error('签名被拒'))
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(await screen.findByText('请在 OKX 里切到该账号后重试')).toBeInTheDocument()
  await waitFor(() => expect(select).toHaveValue(A))
})

it('hides the manage-accounts option when the wallet does not support it', async () => {
  addSaved(B, VALID)
  vi.mocked(supportsRequestPermissions).mockResolvedValue(false)
  renderMenu()
  await screen.findByLabelText('账号')
  expect(screen.queryByRole('option', { name: '切换账号…' })).not.toBeInTheDocument()
})

it('degrades to plain text when only the session address is known and switching accounts is unsupported', async () => {
  vi.mocked(supportsRequestPermissions).mockResolvedValue(false)
  renderMenu()
  await waitFor(() => expect(screen.getByText(shortAddress(A))).toBeInTheDocument())
  expect(screen.queryByLabelText('账号')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('requests permissions and refreshes accounts when "manage" is selected', async () => {
  const refresh = vi.fn(async () => {})
  addSaved(B, VALID)
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [], current: A, refresh })
  vi.mocked(requestPermissions).mockResolvedValueOnce(true)
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await screen.findByRole('option', { name: '切换账号…' })
  await userEvent.selectOptions(select, '切换账号…')
  expect(requestPermissions).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(select).toHaveValue(A)
  expect(runSwitchChain).not.toHaveBeenCalled()
})

it('passes a checksummed address into runSwitchChain, not the lowercase option value', async () => {
  const C = '0xabcdef1234567890abcdef1234567890abcdef12'
  addSaved(C.toLowerCase(), VALID)
  mockSucceeds()
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, C.toLowerCase())
  expect(runSwitchChain).toHaveBeenCalledWith(getAddress(C), expect.any(Object))
  expect(runSwitchChain).not.toHaveBeenCalledWith(C.toLowerCase(), expect.anything())
})

it('disables the select while a switch is in flight', async () => {
  addSaved(B, VALID)
  let resolveSwitch: () => void = () => {}
  vi.mocked(runSwitchChain).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveSwitch = () => resolve(undefined)
    }),
  )
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  await waitFor(() => expect(select).toBeDisabled())
  resolveSwitch()
  await waitFor(() => expect(select).not.toBeDisabled())
})

it('disables the select whenever any switch chain is busy, even one this menu did not start', async () => {
  renderMenu()
  const select = await screen.findByLabelText('账号')
  expect(select).not.toBeDisabled()
  act(() => {
    busyState.busy = true
    busyState.listeners.forEach((cb) => cb())
  })
  expect(select).toBeDisabled()
  act(() => {
    busyState.busy = false
    busyState.listeners.forEach((cb) => cb())
  })
  expect(select).not.toBeDisabled()
})

it('shows the backend message for an ApiError instead of the generic wallet-switch copy', async () => {
  addSaved(B, VALID)
  mockFails(new ApiError(403, '账号已被管理员锁定'))
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(await screen.findByText('账号已被管理员锁定')).toBeInTheDocument()
  expect(screen.queryByText('请在 OKX 里切到该账号后重试')).not.toBeInTheDocument()
})

it('shows the in-flight message verbatim instead of the generic wallet-switch copy', async () => {
  addSaved(B, VALID)
  mockFails(new Error('切换进行中，请稍候'))
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(await screen.findByText('切换进行中，请稍候')).toBeInTheDocument()
  expect(screen.queryByText('请在 OKX 里切到该账号后重试')).not.toBeInTheDocument()
  await waitFor(() => expect(select).toHaveValue(A))
})
