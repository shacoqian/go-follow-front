import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({
  adminApi: {
    operators: vi.fn(),
    createOperator: vi.fn(),
    setOperatorEnabled: vi.fn(),
    deleteOperator: vi.fn(),
    operatorWithdraw: vi.fn(),
    execStatus: vi.fn(),
  },
}))

import { ApiError } from '@/api/client'
import { adminApi, type Operator } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import { useToasts, Toaster } from '@/components/ui/toast'
import OperatorsPage from './OperatorsPage'

const unregistered: Operator = {
  id: 1, address: '0x1111111111111111111111111111111111111111', label: '', enabled: false, registered: false,
  in_flight: 0, removed: false, removed_reason: '', created_at: '', eth_balance: '0',
}
const registeredDisabled: Operator = {
  id: 2, address: '0x2222222222222222222222222222222222222222', label: '', enabled: false, registered: true,
  in_flight: 0, removed: false, removed_reason: '', created_at: '', eth_balance: '1000000000000000000',
}
const enabledOp: Operator = {
  id: 3, address: '0x3333333333333333333333333333333333333333', label: '', enabled: true, registered: true,
  in_flight: 2, removed: false, removed_reason: '', created_at: '', eth_balance: '500000000000000000',
}
const removedEnabled: Operator = {
  id: 4, address: '0x4444444444444444444444444444444444444444', label: '', enabled: true, registered: true,
  in_flight: 0, removed: true, removed_reason: 'gas 不足', created_at: '', eth_balance: '0',
}
const removedDisabled: Operator = {
  id: 5, address: '0x5555555555555555555555555555555555555555', label: '', enabled: false, registered: true,
  in_flight: 0, removed: true, removed_reason: '连续失败', created_at: '', eth_balance: '0',
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OperatorsPage />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  vi.mocked(adminApi.operators).mockResolvedValue([unregistered, registeredDisabled, enabledOp, removedEnabled, removedDisabled])
  vi.mocked(adminApi.execStatus).mockResolvedValue({ operators_ready: 2, allowance_cache_entries: 5, daily_spent: [] })
})

it('renders every operator state with its exact action set', async () => {
  renderPage()
  expect(await screen.findByText('可用 operator 2 · 授权缓存 5')).toBeInTheDocument()

  const row1 = (await screen.findByText('0x1111…1111')).closest('tr')!
  expect(within(row1).getByText('未登记')).toBeInTheDocument()
  expect(within(row1).getByRole('button', { name: '删除' })).toBeInTheDocument()
  expect(within(row1).queryByRole('button', { name: '启用' })).not.toBeInTheDocument()
  expect(within(row1).queryByRole('button', { name: '停用' })).not.toBeInTheDocument()
  expect(within(row1).queryByRole('button', { name: '提回 ETH' })).not.toBeInTheDocument()

  const row2 = screen.getByText('0x2222…2222').closest('tr')!
  expect(within(row2).getByText('已登记')).toBeInTheDocument()
  expect(within(row2).getByText('已停用')).toBeInTheDocument()
  expect(within(row2).getByRole('button', { name: '启用' })).toBeInTheDocument()
  expect(within(row2).getByRole('button', { name: '删除' })).toBeInTheDocument()
  expect(within(row2).getByRole('button', { name: '提回 ETH' })).toBeInTheDocument()

  const row3 = screen.getByText('0x3333…3333').closest('tr')!
  expect(within(row3).getByText('已启用')).toBeInTheDocument()
  expect(within(row3).getByRole('button', { name: '停用' })).toBeInTheDocument()
  expect(within(row3).getByRole('button', { name: '提回 ETH' })).toBeInTheDocument()
  expect(within(row3).queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  expect(within(row3).getByText('2')).toBeInTheDocument() // 在途

  // removed && enabled：启用(恢复) + 停用，不给删除/提回
  const row4 = screen.getByText('0x4444…4444').closest('tr')!
  expect(within(row4).getByText('已摘除：gas 不足')).toBeInTheDocument()
  expect(within(row4).getByRole('button', { name: '启用' })).toBeInTheDocument()
  expect(within(row4).getByRole('button', { name: '停用' })).toBeInTheDocument()
  expect(within(row4).queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  expect(within(row4).queryByRole('button', { name: '提回 ETH' })).not.toBeInTheDocument()

  // removed && !enabled：启用 + 删除，不给停用/提回
  const row5 = screen.getByText('0x5555…5555').closest('tr')!
  expect(within(row5).getByText('已摘除：连续失败')).toBeInTheDocument()
  expect(within(row5).getByRole('button', { name: '启用' })).toBeInTheDocument()
  expect(within(row5).getByRole('button', { name: '删除' })).toBeInTheDocument()
  expect(within(row5).queryByRole('button', { name: '停用' })).not.toBeInTheDocument()
  expect(within(row5).queryByRole('button', { name: '提回 ETH' })).not.toBeInTheDocument()
})

it('generates an operator, toasts the shortened address and refreshes the list', async () => {
  vi.mocked(adminApi.createOperator).mockResolvedValue({ id: 6, address: '0x6666666666666666666666666666666666666666' })
  renderPage()
  await screen.findByText('0x1111…1111')
  await userEvent.click(screen.getByRole('button', { name: '生成' }))
  expect(await screen.findByText('已生成 0x6666…6666')).toBeInTheDocument()
  expect(adminApi.operators).toHaveBeenCalledTimes(2)
})

it('shows the 409 message inline when enabling an unregistered operator', async () => {
  vi.mocked(adminApi.setOperatorEnabled).mockRejectedValue(new ApiError(409, '尚未在链上登记为 operator'))
  renderPage()
  const row = (await screen.findByText('0x2222…2222')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '启用' }))
  expect(await within(row).findByText('尚未在链上登记为 operator')).toBeInTheDocument()
  expect(adminApi.setOperatorEnabled).toHaveBeenCalledWith(2, true)
})

it('shows a force-bypassable 409 delete message with a 强制删除 button that retries with force=true', async () => {
  vi.mocked(adminApi.deleteOperator)
    .mockRejectedValueOnce(new ApiError(409, '钱包仍有余额，请先提回'))
    .mockResolvedValueOnce(undefined)
  renderPage()
  const row = (await screen.findByText('0x2222…2222')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await within(row).findByText('钱包仍有余额，请先提回')).toBeInTheDocument()
  expect(adminApi.deleteOperator).toHaveBeenCalledWith(2, false)

  await userEvent.click(within(row).getByRole('button', { name: '强制删除' }))
  expect(adminApi.deleteOperator).toHaveBeenLastCalledWith(2, true)
  expect(await screen.findByText('已删除')).toBeInTheDocument()
})

it('shows a non-bypassable 409 delete message (仍有在途交易) with no 强制删除 button', async () => {
  vi.mocked(adminApi.deleteOperator).mockRejectedValue(new ApiError(409, '仍有在途交易'))
  renderPage()
  const row = (await screen.findByText('0x2222…2222')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await within(row).findByText('仍有在途交易')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '强制删除' })).not.toBeInTheDocument()
})

it('shows a non-bypassable 409 delete message (请先停用该 operator) with no 强制删除 button', async () => {
  vi.mocked(adminApi.deleteOperator).mockRejectedValue(new ApiError(409, '请先停用该 operator'))
  renderPage()
  const row = (await screen.findByText('0x2222…2222')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await within(row).findByText('请先停用该 operator')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '强制删除' })).not.toBeInTheDocument()
})

it('clears a stale row error once a different row succeeds', async () => {
  vi.mocked(adminApi.setOperatorEnabled).mockRejectedValueOnce(new ApiError(409, '尚未在链上登记为 operator'))
  renderPage()
  const row2 = (await screen.findByText('0x2222…2222')).closest('tr')!
  await userEvent.click(within(row2).getByRole('button', { name: '启用' }))
  expect(await within(row2).findByText('尚未在链上登记为 operator')).toBeInTheDocument()

  vi.mocked(adminApi.setOperatorEnabled).mockResolvedValueOnce({ ok: true, id: 3, enabled: false })
  const row3 = screen.getByText('0x3333…3333').closest('tr')!
  await userEvent.click(within(row3).getByRole('button', { name: '停用' }))
  await waitFor(() => expect(adminApi.setOperatorEnabled).toHaveBeenCalledWith(3, false))
  await waitFor(() => expect(within(row2).queryByText('尚未在链上登记为 operator')).not.toBeInTheDocument())
})

it('withdraws the full balance by calling operatorWithdraw with "all"', async () => {
  vi.mocked(adminApi.operatorWithdraw).mockResolvedValue({ status: 200, data: { id: 1, tx_hash: '0xhash', status: 'SENT' } })
  renderPage()
  const row = (await screen.findByText('0x3333…3333')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '提回 ETH' }))
  await userEvent.click(screen.getByLabelText('全部'))
  await userEvent.click(screen.getByRole('button', { name: '提回' }))
  expect(adminApi.operatorWithdraw).toHaveBeenCalledWith(3, 'all')
  expect(await screen.findByText('已提交提回')).toBeInTheDocument()
})
