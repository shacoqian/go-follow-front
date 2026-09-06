import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { tasks: vi.fn(), positions: vi.fn(), wallets: vi.fn(), withdrawals: vi.fn(), decisions: vi.fn(), disableTask: vi.fn(), enableTask: vi.fn() } }))

import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import DataPage from './DataPage'
import { defaultStrategy, toBackend } from '@/features/tasks/strategySchema'

const task = { ...toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }), id: 10, owner: '0xabc', enabled: true, spent_usdg: '0', consecutive_failures: 0, paused_reason: '', paused_at: null }

function renderPage(path = '/admin/data') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DataPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.tasks).mockResolvedValue([task])
  vi.mocked(adminApi.wallets).mockResolvedValue([{ id: 1, owner: '0xabc', address: '0x1111111111111111111111111111111111111111', label: 'w', note: '', status: 'active', created_at: '' } as never])
  vi.mocked(adminApi.disableTask).mockResolvedValue(undefined)
})

it('lists tasks by default, filters by owner from the URL, switches tabs, and emergency-disables', async () => {
  renderPage('/admin/data?owner=0xabc')
  expect(await screen.findByDisplayValue('0xabc')).toBeInTheDocument()
  expect(adminApi.tasks).toHaveBeenLastCalledWith('0xabc')
  const row = (await screen.findByText('0xabc')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '紧急禁用' }))
  await userEvent.click(screen.getByRole('button', { name: '确认禁用' }))
  expect(adminApi.disableTask).toHaveBeenCalledWith(10)

  await userEvent.click(screen.getByRole('tab', { name: '钱包' }))
  expect(await screen.findByText('0x1111…1111')).toBeInTheDocument()
  expect(adminApi.wallets).toHaveBeenLastCalledWith('0xabc')
  expect(screen.queryByText(/wallet_key/)).not.toBeInTheDocument()
})
