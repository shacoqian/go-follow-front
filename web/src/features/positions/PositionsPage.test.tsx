import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/positions', () => ({ positionsApi: { byTask: vi.fn(), sell: vi.fn() } }))

import { ApiError } from '@/api/client'
import { tasksApi } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { positionsApi, type Position } from '@/api/positions'
import { makeQueryClient } from '@/app/queryClient'
import PositionsPage from './PositionsPage'

const pos: Position = {
  id: 7,
  task_id: 10,
  token: '0x3333333333333333333333333333333333333333',
  qty: '1000',
  cost_usdg: '10000000',
  avg_price_usdg: 10000,
  addon_count: 1,
  tp_done: false,
  realized_usdg: '0',
  virtual: true,
  updated_at: '',
  exit_fail_count: 2,
  last_exit_error: 'reserve_short',
  next_exit_at: '2026-09-06T04:34:00Z',
}

function renderPage(path = '/positions?task=10') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PositionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasksApi.list).mockResolvedValue([{ id: 10, wallet_id: 1, target_id: 2 } as never])
  vi.mocked(targetsApi.list).mockResolvedValue([
    { id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' },
  ])
  vi.mocked(walletsApi.list).mockResolvedValue([
    {
      id: 1,
      address: '0x1111111111111111111111111111111111111111',
      label: '主钱包',
      status: 'active',
      usdg_balance: '0',
      eth_balance: '0',
      task_count: 1,
      has_pending_withdrawal: false,
      note: '',
      created_at: '',
    },
  ])
  vi.mocked(positionsApi.byTask).mockResolvedValue([pos])
})

it('preselects the task from the query string and lists positions with badges and blocked text', async () => {
  renderPage()
  expect(await screen.findByLabelText('任务')).toHaveValue('10')
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  expect(within(row).getByText('dry-run')).toBeInTheDocument()
  expect(within(row).getByText('10')).toBeInTheDocument() // cost 10 USDG
  expect(within(row).getByText(/退出受阻：reserve_short，连续 2 次/)).toBeInTheDocument()
})

it('ignores a non-numeric task query param and shows no selection', async () => {
  renderPage('/positions?task=abc')
  expect(await screen.findByLabelText('任务')).toHaveValue('')
  expect(screen.getAllByText('请选择任务').length).toBeGreaterThan(0)
  expect(screen.queryByText('#NaN')).not.toBeInTheDocument()
  expect(positionsApi.byTask).not.toHaveBeenCalled()
})

it('sells a percentage and shows the result; errors render inline', async () => {
  vi.mocked(positionsApi.sell).mockResolvedValueOnce({ outcome: 'DRY_RUN', reason: 'manual', sell_qty: '500', quoted_out: '4000000' })
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '卖出' }))
  const slider = screen.getByLabelText('卖出比例')
  // jsdom 的受控 range 对原生 dispatchEvent 不一定生效，改用 fireEvent.change 触发 React 的 onChange。
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(slider, { target: { value: '50' } })
  await userEvent.click(screen.getByRole('button', { name: '确认卖出' }))
  expect(positionsApi.sell).toHaveBeenCalledWith(7, 5000)
  expect(await screen.findByText(/DRY_RUN/)).toBeInTheDocument()
  expect(screen.getByText(/500/)).toBeInTheDocument()

  vi.mocked(positionsApi.sell).mockRejectedValueOnce(new ApiError(409, '该仓位已有退出订单在途'))
  await userEvent.click(screen.getByRole('button', { name: '确认卖出' }))
  expect(await screen.findByText('该仓位已有退出订单在途')).toBeInTheDocument()
})
