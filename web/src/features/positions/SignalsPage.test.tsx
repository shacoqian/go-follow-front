import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/signals', () => ({ signalsApi: { list: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { signalsApi, type Signal } from '@/api/signals'
import { makeQueryClient } from '@/app/queryClient'
import SignalsPage from './SignalsPage'

const s: Signal = { id: 1, block: 55843185, tx_hash: '0xhash', target_addr: '0x2222222222222222222222222222222222222222', side: 'BUY', token: '0x3333333333333333333333333333333333333333', token_amount: '1000', quote_asset: 'ETH', quote_amount: '10000000000000000', quote_token: '', venue: 'pons_curve', venue_addr: '0xv', target_balance_before: '0', target_balance_after: '1000', fill_price_usdg: 0, seen_at: '2026-09-06T08:41:24Z' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: s.target_addr, label: '大户A', note: '', created_at: '' }])
  vi.mocked(signalsApi.list).mockResolvedValue([s])
})

it('lists signals and filters by target', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SignalsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('55843185')).toBeInTheDocument()
  expect(screen.getByText('BUY')).toBeInTheDocument()
  expect(screen.getByText('0.01 ETH')).toBeInTheDocument()
  expect(screen.getByText('pons_curve')).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('目标'), s.target_addr)
  expect(signalsApi.list).toHaveBeenLastCalledWith({ target: s.target_addr, limit: 50 })
})
