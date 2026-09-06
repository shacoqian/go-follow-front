import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/tasks', () => ({ tasksApi: { create: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { tasksApi } from '@/api/tasks'
import { makeQueryClient } from '@/app/queryClient'
import TaskWizardPage from './TaskWizardPage'
import { defaultStrategy, toBackend } from './strategySchema'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([
    { id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active', usdg_balance: '5000000', eth_balance: '0', task_count: 0, has_pending_withdrawal: false, note: '', created_at: '' },
    { id: 3, address: '0x3333333333333333333333333333333333333333', label: '停用', status: 'disabled', usdg_balance: '0', eth_balance: '0', task_count: 0, has_pending_withdrawal: false, note: '', created_at: '' },
  ])
  vi.mocked(tasksApi.create).mockResolvedValue({ id: 10 })
})

it('walks target → wallet → strategy and creates the task', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/tasks/new']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tasks/new" element={<TaskWizardPage />} />
          <Route path="/tasks" element={<div>任务列表</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await userEvent.selectOptions(await screen.findByLabelText('目标地址'), '2')
  await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  const walletSelect = await screen.findByLabelText('跟单钱包')
  expect(walletSelect).not.toHaveTextContent('停用')
  await userEvent.selectOptions(walletSelect, '1')
  expect(screen.getByText(/5 USDG/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  await userEvent.click(await screen.findByRole('button', { name: '创建任务' }))
  expect(tasksApi.create).toHaveBeenCalledWith(toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 }))
  expect(await screen.findByText('任务列表')).toBeInTheDocument()
})
