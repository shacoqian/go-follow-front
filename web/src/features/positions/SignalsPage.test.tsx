import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/signals', () => ({ signalsApi: { list: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { signalsApi, type Signal } from '@/api/signals'
import { makeQueryClient } from '@/app/queryClient'
import SignalsPage from './SignalsPage'

const s: Signal = { id: 1, block: 55843185, tx_hash: '0xhash', tx_from: '0x2222222222222222222222222222222222222222', via: 'self', relay_router: '', target_addr: '0x2222222222222222222222222222222222222222', side: 'BUY', token: '0x3333333333333333333333333333333333333333', token_amount: '1000', quote_asset: 'ETH', quote_amount: '10000000000000000', quote_token: '', venue: 'pons_curve', venue_addr: '0xv', target_balance_before: '0', target_balance_after: '1000', fill_price_usdg: 0, seen_at: '2026-09-06T08:41:24Z' }
const s2: Signal = { ...s, id: 2, block: 55843186, via: 'relay', tx_from: '0x1cd9d560440aab96f7b0a007ced7c2191cac5baf', relay_router: '0xrouter' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: s.target_addr, label: '大户A', note: '', created_at: '' }])
  vi.mocked(signalsApi.list).mockResolvedValue([s, s2])
})

it('lists signals and filters by target', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SignalsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('55843185')).toBeInTheDocument()
  expect(screen.getAllByText('BUY')).toHaveLength(2)
  expect(screen.getAllByText('0.01 ETH')).toHaveLength(2)
  expect(screen.getAllByText('pons_curve')).toHaveLength(2)
  await userEvent.selectOptions(screen.getByLabelText('目标'), s.target_addr)
  expect(signalsApi.list).toHaveBeenLastCalledWith({ target: s.target_addr, limit: 50 })
})

it('shows 本人/代发 badges and filters by via', async () => {
  // staleTime: 0，避免选回“全部”时命中挂载时缓存的同一 query key 而不发起新请求，断言拿不到期望的调用参数。
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SignalsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText('55843185')
  const table = within(screen.getByRole('table'))
  expect(table.getByText('本人')).toBeInTheDocument()
  const relayBadge = table.getByText('代发')
  expect(relayBadge).toBeInTheDocument()
  expect(relayBadge).toHaveAttribute('title', '发送方 0x1cd9…5baf')

  await userEvent.selectOptions(screen.getByLabelText('来源'), '代发')
  expect(signalsApi.list).toHaveBeenLastCalledWith({ via: 'relay', limit: 50 })

  await userEvent.selectOptions(screen.getByLabelText('来源'), '全部')
  expect(signalsApi.list).toHaveBeenLastCalledWith({ limit: 50 })
})

it('shows the short address only when a target has no label', async () => {
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: s.target_addr, label: '', note: '', created_at: '' }])
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SignalsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText('55843185')
  expect(screen.getByRole('option', { name: '0x2222…2222' })).toBeInTheDocument()
})
