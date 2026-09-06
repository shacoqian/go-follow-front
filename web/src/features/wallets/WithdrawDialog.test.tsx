import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/wallets', () => ({ walletsApi: { withdraw: vi.fn() }, withdrawalsApi: { get: vi.fn() } }))

import { ApiError } from '@/api/client'
import { walletsApi, withdrawalsApi, type Wallet, type Withdrawal } from '@/api/wallets'
import { useSession } from '@/features/auth/session'
import { makeQueryClient } from '@/app/queryClient'
import { WithdrawDialog } from './WithdrawDialog'

const w = { id: 7, address: '0xabc', label: 'w', usdg_balance: '12500000', eth_balance: '2000000000000000', status: 'active' } as Wallet
const wd = (status: Withdrawal['status'], error = ''): Withdrawal =>
  ({ id: 99, wallet_id: 7, asset: 'USDG', amount: '1000000', to_addr: '0xme', status, error, tx_hash: '0xhash', created_at: '', updated_at: '' })

function renderDlg(onOpenChange: (o: boolean) => void = () => {}) {
  const onSubmitted = vi.fn()
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <WithdrawDialog wallet={w} open onOpenChange={onOpenChange} onSubmitted={onSubmitted} pollMs={50} />
    </QueryClientProvider>,
  )
  return onSubmitted
}
beforeEach(() => {
  vi.clearAllMocks()
  useSession.getState().setSession({ token: 't', address: '0x00000000000000000000000000000000000000me', role: 'user', expiresAt: '' })
})

it('shows balance and the fixed destination, submits USDG in units, then polls to CONFIRMED', async () => {
  vi.mocked(walletsApi.withdraw).mockResolvedValue({ status: 200, data: { id: 99, tx_hash: '0xhash', status: 'SENT' } })
  vi.mocked(withdrawalsApi.get).mockResolvedValueOnce(wd('SENT')).mockResolvedValue(wd('CONFIRMED'))
  const onSubmitted = renderDlg()
  expect(screen.getByText('可用 12.5 USDG')).toBeInTheDocument()
  expect(screen.getByDisplayValue('0x00000000000000000000000000000000000000me')).toHaveAttribute('readonly')
  await userEvent.type(screen.getByLabelText('金额'), '1')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(walletsApi.withdraw).toHaveBeenCalledWith(7, { asset: 'USDG', amount: '1000000' })
  expect(onSubmitted).toHaveBeenCalled()
  expect(await screen.findByText('已广播')).toBeInTheDocument()
  expect(screen.getByText('0xhash')).toBeInTheDocument()
  expect(await screen.findByText('已确认')).toBeInTheDocument()
})

it('sends "all" for ETH when the checkbox is on and shows the 202 note', async () => {
  vi.mocked(walletsApi.withdraw).mockResolvedValue({ status: 202, data: { id: 99, tx_hash: '0xhash', status: 'SENT', note: '已广播，状态待确认' } })
  vi.mocked(withdrawalsApi.get).mockResolvedValue(wd('SENT'))
  renderDlg()
  await userEvent.selectOptions(screen.getByLabelText('资产'), 'ETH')
  expect(screen.getByText('可用 0.002 ETH')).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('全部'))
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(walletsApi.withdraw).toHaveBeenCalledWith(7, { asset: 'ETH', amount: 'all' })
  expect(await screen.findByText('已广播，状态待确认')).toBeInTheDocument()
})

it('shows mapped 400 errors and FAILED with the backend error text', async () => {
  vi.mocked(walletsApi.withdraw).mockRejectedValueOnce(new ApiError(400, 'insufficient gas'))
  renderDlg()
  await userEvent.type(screen.getByLabelText('金额'), '1')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(await screen.findByText('ETH 不足以支付 gas')).toBeInTheDocument()

  vi.mocked(walletsApi.withdraw).mockResolvedValue({ status: 200, data: { id: 99, tx_hash: '0xhash', status: 'SENT' } })
  vi.mocked(withdrawalsApi.get).mockResolvedValue(wd('FAILED', 'dropped'))
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(await screen.findByText('失败')).toBeInTheDocument()
  expect(screen.getByText(/dropped/)).toBeInTheDocument()
  expect(screen.getByText(/请按哈希核对链上/)).toBeInTheDocument()
})

it('rejects a malformed amount before calling the API', async () => {
  renderDlg()
  await userEvent.type(screen.getByLabelText('金额'), '1.2.3')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  expect(await screen.findByText('金额格式不正确')).toBeInTheDocument()
  expect(walletsApi.withdraw).not.toHaveBeenCalled()
})

it('cannot be dismissed while the withdrawal request is in flight', async () => {
  vi.mocked(walletsApi.withdraw).mockReturnValue(new Promise(() => {}))
  const onOpenChange = vi.fn()
  renderDlg(onOpenChange)
  await userEvent.type(screen.getByLabelText('金额'), '1')
  await userEvent.click(screen.getByRole('button', { name: '提现' }))
  await userEvent.keyboard('{Escape}')
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
})
