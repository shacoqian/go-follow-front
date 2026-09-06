import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/wallets', () => ({ walletsApi: { remove: vi.fn() } }))
vi.mock('@/features/auth/auth', () => ({ signAction: vi.fn() }))

import { ApiError } from '@/api/client'
import { walletsApi, type Wallet } from '@/api/wallets'
import { signAction } from '@/features/auth/auth'
import { useToasts } from '@/components/ui/toast'
import { makeQueryClient } from '@/app/queryClient'
import { DeleteWalletDialog } from './DeleteWalletDialog'

const w = { id: 7, address: '0xabc', label: 'w' } as Wallet
function renderDlg(onDeleted = vi.fn()) {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DeleteWalletDialog wallet={w} open onOpenChange={() => {}} onDeleted={onDeleted} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onDeleted
}
beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  vi.mocked(signAction).mockResolvedValue('0xsig')
})

it('requires the acknowledgement, signs with force=0 and reports success', async () => {
  vi.mocked(walletsApi.remove).mockResolvedValue(undefined)
  const onDeleted = renderDlg()
  const btn = screen.getByRole('button', { name: '签名并删除' })
  expect(btn).toBeDisabled()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  await userEvent.click(btn)
  expect(signAction).toHaveBeenCalledWith('delete_wallet', { wallet_id: '7', force: '0' })
  expect(walletsApi.remove).toHaveBeenCalledWith(7, '0xsig', false)
  expect(onDeleted).toHaveBeenCalled()
})

it('lists referencing tasks on 409', async () => {
  vi.mocked(walletsApi.remove).mockRejectedValue(new ApiError(409, '钱包仍被任务引用', { error: '钱包仍被任务引用', task_ids: [3, 4] }))
  renderDlg()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  await userEvent.click(screen.getByRole('button', { name: '签名并删除' }))
  expect(await screen.findByText('钱包仍被任务引用')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '任务 #3' })).toHaveAttribute('href', '/tasks')
  expect(screen.getByRole('link', { name: '任务 #4' })).toBeInTheDocument()
})

it('offers force delete when the wallet still has balance and re-signs with force=1', async () => {
  vi.mocked(walletsApi.remove)
    .mockRejectedValueOnce(new ApiError(409, '钱包仍有余额', { error: '钱包仍有余额', usdg: '20000', eth: '0' }))
    .mockResolvedValueOnce(undefined)
  const onDeleted = renderDlg()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  await userEvent.click(screen.getByRole('button', { name: '签名并删除' }))
  expect(await screen.findByText(/USDG 0.02/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '仍然删除' }))
  expect(signAction).toHaveBeenLastCalledWith('delete_wallet', { wallet_id: '7', force: '1' })
  expect(walletsApi.remove).toHaveBeenLastCalledWith(7, '0xsig', true)
  expect(onDeleted).toHaveBeenCalled()
})

it('shows wait messages for in-flight withdrawal / unknown balance / busy', async () => {
  for (const msg of ['提现进行中', '余额未知', '钱包忙，请稍后重试']) {
    vi.mocked(walletsApi.remove).mockRejectedValueOnce(new ApiError(409, msg, { error: msg }))
  }
  renderDlg()
  await userEvent.click(screen.getByLabelText('我知道删除不可恢复'))
  for (const msg of ['提现进行中', '余额未知', '钱包忙，请稍后重试']) {
    await userEvent.click(screen.getByRole('button', { name: '签名并删除' }))
    expect(await screen.findByText(msg)).toBeInTheDocument()
  }
})
