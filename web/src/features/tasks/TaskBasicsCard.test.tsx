import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn(), create: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { makeQueryClient } from '@/app/queryClient'
import { TaskBasicsCard } from './TaskBasicsCard'

const target = {
  id: 2,
  address: '0x2222222222222222222222222222222222222222',
  label: '大户A',
  note: '',
  created_at: '',
}
const wallet = {
  id: 1,
  address: '0x1111111111111111111111111111111111111111',
  label: '主钱包',
  status: 'active' as const,
  usdg_balance: '5000000',
  eth_balance: '2000000000000000',
  task_count: 0,
  has_pending_withdrawal: false,
  note: '',
  created_at: '',
}
const disabled = { ...wallet, id: 3, label: '停用', status: 'disabled' as const }

function renderCard(props: Partial<React.ComponentProps<typeof TaskBasicsCard>> = {}) {
  const onTargetChange = vi.fn()
  const onWalletChange = vi.fn()
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <TaskBasicsCard
        targetId={null}
        walletId={null}
        onTargetChange={onTargetChange}
        onWalletChange={onWalletChange}
        {...props}
      />
    </QueryClientProvider>,
  )
  return { onTargetChange, onWalletChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([target])
  vi.mocked(walletsApi.list).mockResolvedValue([wallet, disabled])
})

it('selects target and active wallet, shows balance', async () => {
  const { onTargetChange, onWalletChange } = renderCard()
  await userEvent.selectOptions(await screen.findByLabelText('目标地址'), '2')
  expect(onTargetChange).toHaveBeenCalledWith(2)
  const ws = await screen.findByLabelText('跟单钱包')
  expect(ws).not.toHaveTextContent('停用')
  await userEvent.selectOptions(ws, '1')
  expect(onWalletChange).toHaveBeenCalledWith(1)
})

it('shows the selected wallet balance and read-only labels', async () => {
  renderCard({ targetId: 2, walletId: 1, readOnly: true })
  expect(await screen.findByText(/大户A/)).toBeInTheDocument()
  expect(await screen.findByText(/主钱包/)).toBeInTheDocument()
  expect(screen.getByText('余额 5 USDG / 0.002 ETH')).toBeInTheDocument()
  expect(screen.queryByLabelText('目标地址')).not.toBeInTheDocument()
})

it('creates a target inline and auto-selects it; creates a wallet inline and auto-selects it', async () => {
  vi.mocked(targetsApi.create).mockResolvedValue({
    id: 9,
    address: '0x3333333333333333333333333333333333333333',
  })
  vi.mocked(walletsApi.create).mockResolvedValue({
    id: 7,
    address: '0x4444444444444444444444444444444444444444',
  })
  const { onTargetChange, onWalletChange } = renderCard()
  await userEvent.click(await screen.findByRole('button', { name: '新增目标' }))
  await userEvent.type(screen.getByLabelText('地址'), '0x3333333333333333333333333333333333333333')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(onTargetChange).toHaveBeenCalledWith(9)

  await userEvent.click(screen.getByRole('button', { name: '创建钱包' }))
  await userEvent.type(screen.getByLabelText('标签'), 'w')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onWalletChange).toHaveBeenCalledWith(7)
})
