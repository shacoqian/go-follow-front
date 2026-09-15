import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/positions', () => ({ positionsApi: { all: vi.fn(), byTask: vi.fn(), sell: vi.fn() } }))
vi.mock('@/api/decisions', () => ({ decisionsApi: { list: vi.fn() } }))
vi.mock('@/api/health', () => ({ healthApi: { get: vi.fn() } }))

import { ApiError } from '@/api/client'
import { tasksApi } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { positionsApi, type Position } from '@/api/positions'
import { decisionsApi, type Decision } from '@/api/decisions'
import { healthApi } from '@/api/health'
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
  updated_at: '2026-09-06T00:00:00Z',
  exit_fail_count: 2,
  last_exit_error: 'reserve_short',
  next_exit_at: '2026-09-06T04:34:00Z',
}

// closedPos 是另一个任务下已清仓的仓位：qty=0、带已实现盈亏，用于「已结束」那一档。
const closedPos: Position = {
  ...pos,
  id: 8,
  task_id: 11,
  token: '0x5555555555555555555555555555555555555555',
  qty: '0',
  cost_usdg: '0',
  realized_usdg: '1396100',
  virtual: false,
  exit_fail_count: 0,
  last_exit_error: '',
  next_exit_at: null,
}

function renderPage(path = '/positions') {
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
  vi.mocked(tasksApi.list).mockResolvedValue([
    { id: 10, wallet_id: 1, target_id: 2 } as never,
    { id: 11, wallet_id: 1, target_id: 2 } as never,
  ])
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
  vi.mocked(positionsApi.all).mockResolvedValue([pos, closedPos])
  vi.mocked(decisionsApi.list).mockResolvedValue([])
  vi.mocked(healthApi.get).mockResolvedValue({ dry_run: true, kill_switch: false, engine_last_block: 1, node_block: 1 })
})

it('lists every position without asking to pick a task, and shows which task each belongs to', async () => {
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  expect(within(row).getByText('dry-run')).toBeInTheDocument()
  expect(within(row).getByText('10')).toBeInTheDocument() // cost 10 USDG
  expect(within(row).getByText(/退出受阻：reserve_short，连续 2 次/)).toBeInTheDocument()
  // 跨任务列仓位，行里必须能看出这笔属于谁。
  expect(within(row).getByText('大户A · 主钱包')).toBeInTheDocument()
  // 页面不再有任务下拉，也不再要求先选。
  expect(screen.queryByLabelText('任务')).not.toBeInTheDocument()
  expect(screen.queryByText('请选择任务')).not.toBeInTheDocument()
})

it('splits 进行中 / 已结束 by qty and defaults to 进行中', async () => {
  renderPage()
  await screen.findByText('0x3333…3333')
  expect(screen.getByRole('button', { name: '进行中 (1)' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '已结束 (1)' })).toBeInTheDocument()
  // 默认只看进行中：已清仓那条不在
  expect(screen.queryByText('0x5555…5555')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '已结束 (1)' }))
  const done = (await screen.findByText('0x5555…5555')).closest('tr')!
  expect(within(done).getByText('1.3961')).toBeInTheDocument() // 已实现盈亏必须看得到
  expect(screen.queryByText('0x3333…3333')).not.toBeInTheDocument()
})

it('honors ?task= as a filter and can clear it back to all', async () => {
  renderPage('/positions?task=11')
  await userEvent.click(await screen.findByRole('button', { name: '已结束 (1)' }))
  expect(await screen.findByText('0x5555…5555')).toBeInTheDocument()
  // 任务 10 的那条被过滤掉了：进行中这一档是空的
  await userEvent.click(screen.getByRole('button', { name: '进行中 (0)' }))
  expect(await screen.findByText('没有进行中的仓位')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '显示全部' }))
  expect(await screen.findByText('0x3333…3333')).toBeInTheDocument()
})

it('ignores a non-numeric task query param and shows everything', async () => {
  renderPage('/positions?task=abc')
  expect(await screen.findByText('0x3333…3333')).toBeInTheDocument()
  expect(screen.queryByText('#NaN')).not.toBeInTheDocument()
  expect(screen.queryByText(/只看任务/)).not.toBeInTheDocument()
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

it('shows a broadcast-pending message with the tx id when a manual sell comes back SENT', async () => {
  vi.mocked(positionsApi.sell).mockResolvedValueOnce({ outcome: 'SENT', reason: '', sell_qty: '500', quoted_out: '4000000', tx_id: 42 })
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '卖出' }))
  await userEvent.click(screen.getByRole('button', { name: '确认卖出' }))
  expect(await screen.findByText(/已广播，等待回执/)).toBeInTheDocument()
  expect(screen.getByText(/42/)).toBeInTheDocument()
})

it('shows an 在途 badge when a pending/sent decision for the task is newer than the position', async () => {
  const sent: Decision = {
    id: 1, signal_id: null, task_id: 10, token: pos.token, side: 'BUY', outcome: 'SENT', reason: '', planned_amount_in: '0',
    planned_min_out: '0', quoted_out: '0', quoted_price_usdg: 0, t_seen: null, t_decided: null, t_quoted: null,
    error: '', created_at: '2026-09-07T00:00:00Z', tx_id: 3, tx_hash: '', filled_in: '0', filled_out: '0', gas_used: 0,
  }
  vi.mocked(decisionsApi.list).mockResolvedValue([sent])
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  expect(await within(row).findByText('在途')).toBeInTheDocument()
})

it('does not mark 在途 for a pending/sent decision on a different token in the same task', async () => {
  const sentOtherToken: Decision = {
    id: 2, signal_id: null, task_id: 10, token: '0x4444444444444444444444444444444444444444', side: 'BUY', outcome: 'SENT',
    reason: '', planned_amount_in: '0', planned_min_out: '0', quoted_out: '0', quoted_price_usdg: 0, t_seen: null,
    t_decided: null, t_quoted: null, error: '', created_at: '2026-09-07T00:00:00Z', tx_id: 4, tx_hash: '',
    filled_in: '0', filled_out: '0', gas_used: 0,
  }
  vi.mocked(decisionsApi.list).mockResolvedValue([sentOtherToken])
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  await within(row).findByText('dry-run') // 等页面稳定渲染完
  expect(within(row).queryByText('在途')).not.toBeInTheDocument()
})

it('shows a dry-run 遗留 badge for a virtual position once the engine is confirmed live', async () => {
  vi.mocked(healthApi.get).mockResolvedValue({ dry_run: false, kill_switch: false, engine_last_block: 1, node_block: 1 })
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  expect(await within(row).findByText('dry-run 遗留')).toBeInTheDocument()
  expect(within(row).queryByText('dry-run')).not.toBeInTheDocument()
})
