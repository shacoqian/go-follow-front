import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/wallets', () => ({
  walletsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), disable: vi.fn(), exportKey: vi.fn(), remove: vi.fn(), withdraw: vi.fn(), withdrawals: vi.fn() },
  withdrawalsApi: { get: vi.fn() },
}))
vi.mock('@/features/auth/auth', () => ({ signAction: vi.fn() }))

import { walletsApi, type Wallet } from '@/api/wallets'
import { useSession } from '@/features/auth/session'
import { makeQueryClient } from '@/app/queryClient'
import WalletsPage from './WalletsPage'

const w1: Wallet = { id: 1, address: '0x8ba1f109551bd432803012645ac136ddd64dba72', label: '主钱包', note: '', status: 'active',
  usdg_balance: '12500000', eth_balance: '100000000000000', task_count: 2, has_pending_withdrawal: true, created_at: '2026-09-06T00:00:00Z' }
const w2: Wallet = { ...w1, id: 2, label: '备用', status: 'disabled', usdg_balance: null, eth_balance: null, balance_error: '余额读取失败', task_count: 0, has_pending_withdrawal: false }

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WalletsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSession.getState().setSession({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  vi.mocked(walletsApi.list).mockResolvedValue([w1, w2])
})

it('lists wallets with formatted balances, counts and badges', async () => {
  renderPage()
  const row = (await screen.findByText('主钱包')).closest('tr')!
  expect(within(row).getByText('0x8ba1…ba72')).toBeInTheDocument()
  expect(within(row).getByText('12.5')).toBeInTheDocument()
  expect(within(row).getByText('0.0001')).toBeInTheDocument()
  expect(within(row).getByText('2')).toBeInTheDocument()
  expect(within(row).getByText('提现中')).toBeInTheDocument()
  const row2 = screen.getByText('备用').closest('tr')!
  expect(within(row2).getAllByText('读取失败')).toHaveLength(2)
  expect(within(row2).getByText('已禁用')).toBeInTheDocument()
})

it('creates a wallet and shows the new address with the funding hint', async () => {
  vi.mocked(walletsApi.create).mockResolvedValue({ id: 3, address: '0x1111111111111111111111111111111111111111' })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '创建钱包' }))
  await userEvent.type(screen.getByLabelText('标签'), '新钱包')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(walletsApi.create).toHaveBeenCalledWith({ label: '新钱包', note: '' })
  expect(await screen.findByText('0x1111111111111111111111111111111111111111')).toBeInTheDocument()
  expect(screen.getByText(/转入 USDG/)).toBeInTheDocument()
  expect(walletsApi.list).toHaveBeenCalledTimes(2)
})

it('edits label/note and disables with confirmation', async () => {
  vi.mocked(walletsApi.update).mockResolvedValue(undefined)
  vi.mocked(walletsApi.disable).mockResolvedValue(undefined)
  renderPage()
  const row = (await screen.findByText('主钱包')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }))
  const label = screen.getByLabelText('标签')
  await userEvent.clear(label)
  await userEvent.type(label, '改名')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(walletsApi.update).toHaveBeenCalledWith(1, { label: '改名', note: '' })

  await userEvent.click(within(row).getByRole('button', { name: '禁用' }))
  await userEvent.click(screen.getByRole('button', { name: '确认禁用' }))
  expect(walletsApi.disable).toHaveBeenCalledWith(1)
})
