import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/decisions', () => ({ decisionsApi: { list: vi.fn() } }))

import { tasksApi } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { decisionsApi, type Decision } from '@/api/decisions'
import { makeQueryClient } from '@/app/queryClient'
import DecisionsPage from './DecisionsPage'

const d = (id: number, outcome: string, reason = 'x'): Decision => ({ id, signal_id: 1, task_id: 10, side: 'BUY', outcome, reason, planned_amount_in: '10000000', planned_min_out: '0', quoted_out: '420', quoted_price_usdg: 23809.5, t_seen: '2026-09-06T08:41:24Z', t_decided: null, t_quoted: null, error: outcome === 'FAILED' ? 'boom' : '', created_at: '2026-09-06T08:41:24Z', tx_id: null, tx_hash: '', filled_in: '0', filled_out: '0', gas_used: 0 })

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DecisionsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasksApi.list).mockResolvedValue([{ id: 10, wallet_id: 1, target_id: 2 } as never])
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([])
})

it('lists decisions with outcome badges and filters by task/outcome; load more grows the limit', async () => {
  const fifty = Array.from({ length: 50 }, (_, i) => d(i + 1, i % 2 ? 'DRY_RUN' : 'SKIPPED'))
  vi.mocked(decisionsApi.list).mockResolvedValueOnce(fifty).mockResolvedValueOnce([d(99, 'FAILED')]).mockResolvedValue([...fifty, d(51, 'FAILED')])
  renderPage()
  expect(await screen.findAllByText('DRY_RUN')).not.toHaveLength(0)
  expect(decisionsApi.list).toHaveBeenLastCalledWith({ limit: 50 })

  await userEvent.selectOptions(screen.getByLabelText('结果'), 'FAILED')
  await userEvent.selectOptions(screen.getByLabelText('任务'), '10')
  expect(await screen.findByText('boom')).toBeInTheDocument()
  expect(decisionsApi.list).toHaveBeenLastCalledWith({ task: 10, outcome: 'FAILED', limit: 50 })

  await userEvent.selectOptions(screen.getByLabelText('结果'), '')
  await userEvent.selectOptions(screen.getByLabelText('任务'), '')
  await screen.findAllByText('SKIPPED')
  await userEvent.click(screen.getByRole('button', { name: '加载更多' }))
  expect(decisionsApi.list).toHaveBeenLastCalledWith({ limit: 100 })
})

it('formats the quoted price to 6 decimal places without trailing zeros', async () => {
  const odd = { ...d(1, 'DRY_RUN'), quoted_price_usdg: 100 / 3 }
  vi.mocked(decisionsApi.list).mockResolvedValue([odd])
  renderPage()
  expect(await screen.findByText('33.333333')).toBeInTheDocument()
})

it('offers PENDING/SENT/EXECUTED in the outcome filter', async () => {
  vi.mocked(decisionsApi.list).mockResolvedValue([])
  renderPage()
  await screen.findByLabelText('结果')
  expect(screen.getByRole('option', { name: 'PENDING' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'SENT' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'EXECUTED' })).toBeInTheDocument()
})

it('shows filled amounts, a tx hash and gas, and flags a capped buy without turning it into a skip', async () => {
  const executed: Decision = {
    ...d(5, 'EXECUTED', 'capped'),
    filled_in: '9000000',
    filled_out: '123456',
    gas_used: 21000,
    tx_id: 7,
    tx_hash: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  }
  vi.mocked(decisionsApi.list).mockResolvedValue([executed])
  renderPage()
  const row = (await screen.findByText('已截断')).closest('tr')!
  const { within } = await import('@testing-library/react')
  expect(within(row).getByText('EXECUTED')).toBeInTheDocument()
  expect(within(row).getByText('花 9 USDG 得 123456')).toBeInTheDocument()
  expect(within(row).getByText('0xdead…beef')).toBeInTheDocument()
  expect(within(row).getByText('21000')).toBeInTheDocument()
})
