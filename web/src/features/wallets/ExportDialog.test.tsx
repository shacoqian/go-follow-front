import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/wallets', () => ({ walletsApi: { exportKey: vi.fn() } }))
vi.mock('@/features/auth/auth', () => ({ signAction: vi.fn() }))

import { ApiError } from '@/api/client'
import { walletsApi, type Wallet } from '@/api/wallets'
import { signAction } from '@/features/auth/auth'
import { useToasts } from '@/components/ui/toast'
import { makeQueryClient } from '@/app/queryClient'
import { ExportDialog } from './ExportDialog'

const w = { id: 7, address: '0xabc', label: 'w' } as Wallet

function renderDlg() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <ExportDialog wallet={w} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.clearAllMocks(); useToasts.setState({ items: [] }) })

it('explains, signs, then shows the ciphertext with a copy button', async () => {
  vi.mocked(signAction).mockResolvedValue('0xsig')
  vi.mocked(walletsApi.exportKey).mockResolvedValue({ address: '0xabc', wallet_key: 'CIPHER' })
  renderDlg()
  expect(screen.getByText(/加密密文/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '签名并导出' }))
  expect(signAction).toHaveBeenCalledWith('export_wallet', { wallet_id: '7' })
  expect(walletsApi.exportKey).toHaveBeenCalledWith(7, '0xsig')
  expect(await screen.findByDisplayValue('CIPHER')).toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()
})

it('shows the rate-limit message on 429', async () => {
  vi.mocked(signAction).mockResolvedValue('0xsig')
  vi.mocked(walletsApi.exportKey).mockRejectedValue(new ApiError(429, '操作过于频繁，请稍后再试'))
  renderDlg()
  await userEvent.click(screen.getByRole('button', { name: '签名并导出' }))
  expect(await screen.findByText('每分钟最多导出 3 次，请稍后再试')).toBeInTheDocument()
})
