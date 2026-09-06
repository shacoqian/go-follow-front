import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/health', () => ({ healthApi: { get: vi.fn() } }))
vi.mock('@/api/wallets', () => ({
  walletsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), disable: vi.fn(), exportKey: vi.fn(), remove: vi.fn(), withdraw: vi.fn(), withdrawals: vi.fn() },
  withdrawalsApi: { get: vi.fn() },
}))
vi.mock('@/wallets/okx', () => ({
  waitForOkx: vi.fn(async () => true),
  isOkxInstalled: vi.fn(() => true),
  onAccountsChanged: vi.fn(() => () => {}),
  requestAccounts: vi.fn(),
  personalSign: vi.fn(),
}))
vi.mock('@/features/auth/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/features/auth/auth')>()
  return { ...mod, refreshMe: vi.fn(async () => true), watchAccountChanges: vi.fn(() => () => {}), logout: vi.fn() }
})

import { healthApi } from '@/api/health'
import { walletsApi } from '@/api/wallets'
import { refreshMe, watchAccountChanges } from '@/features/auth/auth'
import { waitForOkx } from '@/wallets/okx'
import { useSession } from '@/features/auth/session'
import { AppRoutes } from './App'
import { makeQueryClient } from './queryClient'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSession.getState().setSession(null)
  vi.mocked(waitForOkx).mockResolvedValue(true)
  vi.mocked(refreshMe).mockResolvedValue(true)
  vi.mocked(watchAccountChanges).mockReturnValue(() => {})
  vi.mocked(healthApi.get).mockResolvedValue({ dry_run: false, kill_switch: false, engine_last_block: 1, node_block: 1 })
  vi.mocked(walletsApi.list).mockResolvedValue([])
})

it('redirects an anonymous visitor to the login page', () => {
  renderAt('/wallets')
  expect(screen.getByRole('button', { name: '连接 OKX 钱包' })).toBeInTheDocument()
})

it('shows the user navigation without the admin group', async () => {
  useSession.getState().setSession({ token: 't', address: '0x8ba1f109551bd432803012645ac136ddd64dba72', role: 'user', expiresAt: '' })
  renderAt('/')
  expect(await screen.findByRole('heading', { name: '钱包' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '跟单' })).toHaveAttribute('href', '/tasks')
  expect(screen.queryByText('管理')).not.toBeInTheDocument()
  expect(screen.getByText('0x8ba1…ba72')).toBeInTheDocument()
})

it('shows the admin group for admins and guards admin routes for users', async () => {
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'admin', expiresAt: '' })
  const first = renderAt('/admin/users')
  expect(await screen.findByRole('heading', { name: '用户' })).toBeInTheDocument()
  expect(screen.getByText('管理')).toBeInTheDocument()
  first.unmount()

  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  renderAt('/admin/users')
  expect(await screen.findAllByRole('heading', { name: '钱包' })).not.toHaveLength(0)
})

it('shows the global banners from /health', async () => {
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  vi.mocked(healthApi.get).mockResolvedValue({ dry_run: true, kill_switch: true, engine_last_block: 1, node_block: 1 })
  renderAt('/wallets')
  expect(await screen.findByText('已全局停止跟单')).toBeInTheDocument()
  expect(screen.getByText('模拟运行中（dry-run）')).toBeInTheDocument()
})

it('arms the account watcher only after OKX is injected', async () => {
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  const first = renderAt('/wallets')
  await waitFor(() => expect(watchAccountChanges).toHaveBeenCalledTimes(1))
  first.unmount()

  vi.mocked(watchAccountChanges).mockClear()
  vi.mocked(waitForOkx).mockResolvedValue(false)
  renderAt('/wallets')
  await waitFor(() => expect(refreshMe).toHaveBeenCalled())
  expect(watchAccountChanges).not.toHaveBeenCalled()
})

it('sends a visitor with an expired session back to the login page', () => {
  useSession.getState().setSession({
    token: 't',
    address: '0xabc',
    role: 'user',
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  })
  renderAt('/wallets')
  expect(screen.getByRole('button', { name: '连接 OKX 钱包' })).toBeInTheDocument()
  expect(useSession.getState().session).toBeNull()
})
