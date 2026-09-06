import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { audit: vi.fn() } }))

import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import AuditPage from './AuditPage'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.audit).mockResolvedValue([{ id: 1, owner: '0xabc', action: 'withdraw', detail: 'asset=USDG amount=1', ip: '1.2.3.4', created_at: '2026-09-06T08:41:24Z' }])
})

it('lists audit rows and filters by action', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuditPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('asset=USDG amount=1')).toBeInTheDocument()
  expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
  expect(adminApi.audit).toHaveBeenLastCalledWith({ limit: 50 })
  await userEvent.selectOptions(screen.getByLabelText('动作'), 'withdraw')
  expect(adminApi.audit).toHaveBeenLastCalledWith({ action: 'withdraw', limit: 50 })
})
