import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { getAddress } from 'viem'

vi.mock('@/features/auth/auth', () => ({ switchAccount: vi.fn() }))
vi.mock('@/features/auth/useOkxAccounts', () => ({ useOkxAccounts: vi.fn() }))
vi.mock('@/wallets/okx', () => ({ requestPermissions: vi.fn(), supportsRequestPermissions: vi.fn(async () => true) }))

import { switchAccount } from '@/features/auth/auth'
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

function renderMenu() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <AccountMenu />
      <Toaster />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  useSession.getState().setSession({ token: 't', address: A, role: 'user', expiresAt: '' })
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [A, B], current: A, refresh: vi.fn(async () => {}) })
  vi.mocked(supportsRequestPermissions).mockResolvedValue(true)
})

afterEach(() => {
  act(() => {
    useSession.getState().setSession(null)
  })
})

it('lists the authorized accounts with the session address selected', async () => {
  renderMenu()
  const select = await screen.findByLabelText('账号')
  expect(select).toHaveValue(A)
  expect(await screen.findByRole('option', { name: '切换账号…' })).toBeInTheDocument()
})

it('switches account successfully and shows a toast', async () => {
  vi.mocked(switchAccount).mockResolvedValueOnce(undefined)
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(switchAccount).toHaveBeenCalledWith(B)
  expect(await screen.findByText('已切换账号')).toBeInTheDocument()
  expect(select).toHaveValue(B)
})

it('reverts to the session address and toasts an error when switching fails', async () => {
  vi.mocked(switchAccount).mockRejectedValueOnce(new Error('签名被拒'))
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(await screen.findByText('请在 OKX 里切到该账号后重试')).toBeInTheDocument()
  await waitFor(() => expect(select).toHaveValue(A))
})

it('hides the manage-accounts option when the wallet does not support it', async () => {
  vi.mocked(supportsRequestPermissions).mockResolvedValue(false)
  renderMenu()
  await screen.findByLabelText('账号')
  expect(screen.queryByRole('option', { name: '切换账号…' })).not.toBeInTheDocument()
})

it('degrades to plain text when only the session address is known and switching accounts is unsupported', async () => {
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [A], current: A, refresh: vi.fn(async () => {}) })
  vi.mocked(supportsRequestPermissions).mockResolvedValue(false)
  renderMenu()
  await waitFor(() => expect(screen.getByText(shortAddress(A))).toBeInTheDocument())
  expect(screen.queryByLabelText('账号')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('shows the session address alone when it is not among the authorized accounts', async () => {
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [B], current: B, refresh: vi.fn(async () => {}) })
  renderMenu()
  const select = await screen.findByLabelText('账号')
  expect(select).toHaveValue(A)
  const values = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
  expect(values).toContain(A)
})

it('requests permissions and refreshes accounts when "manage" is selected', async () => {
  const refresh = vi.fn(async () => {})
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [A, B], current: A, refresh })
  vi.mocked(requestPermissions).mockResolvedValueOnce(true)
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await screen.findByRole('option', { name: '切换账号…' })
  await userEvent.selectOptions(select, '切换账号…')
  expect(requestPermissions).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(select).toHaveValue(A)
  expect(switchAccount).not.toHaveBeenCalled()
})

it('passes a checksummed address into switchAccount, not the lowercase option value', async () => {
  const C = '0xabcdef1234567890abcdef1234567890abcdef12'
  vi.mocked(useOkxAccounts).mockReturnValue({ accounts: [A, C], current: A, refresh: vi.fn(async () => {}) })
  vi.mocked(switchAccount).mockResolvedValueOnce(undefined)
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, C.toLowerCase())
  expect(switchAccount).toHaveBeenCalledWith(getAddress(C))
  expect(switchAccount).not.toHaveBeenCalledWith(C.toLowerCase())
})

it('disables the select while a switch is in flight', async () => {
  let resolveSwitch: () => void = () => {}
  vi.mocked(switchAccount).mockReturnValueOnce(
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

it('shows the backend message for an ApiError instead of the generic wallet-switch copy', async () => {
  vi.mocked(switchAccount).mockRejectedValueOnce(new ApiError(403, '账号已被管理员锁定'))
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(await screen.findByText('账号已被管理员锁定')).toBeInTheDocument()
  expect(screen.queryByText('请在 OKX 里切到该账号后重试')).not.toBeInTheDocument()
})

it('shows the in-flight message verbatim instead of the generic wallet-switch copy', async () => {
  vi.mocked(switchAccount).mockRejectedValueOnce(new Error('切换进行中，请稍候'))
  renderMenu()
  const select = await screen.findByLabelText('账号')
  await userEvent.selectOptions(select, B)
  expect(await screen.findByText('切换进行中，请稍候')).toBeInTheDocument()
  expect(screen.queryByText('请在 OKX 里切到该账号后重试')).not.toBeInTheDocument()
  await waitFor(() => expect(select).toHaveValue(A))
})
