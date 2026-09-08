import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { overview: vi.fn(), users: vi.fn(), setSetting: vi.fn() } }))
vi.mock('@/api/health', () => ({ healthApi: { get: vi.fn() } }))

import { adminApi, type Overview } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import OverviewPage from './OverviewPage'

const ov: Overview = { tasks: 13, tasks_enabled: 12, positions_open: 4, decisions_today: 77, spent_usdg: '123456789',
  engine: { engine_last_block: 100, node_block: 150, last_signal_at: '2026-09-06T08:41:24Z', kill_switch: false, dry_run: true, stock_tokens: 13, targets: 15, exit_scan_last_at: null, exit_scan_errors: 2, exit_scan_backoff: 1, positions_blocked: 1, goswapevm_error: 'unhealthy', operators_ready: 3 } }

function renderPage() {
  return render(<QueryClientProvider client={makeQueryClient()}><OverviewPage /></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.overview).mockResolvedValue(ov)
  vi.mocked(adminApi.users).mockResolvedValue([{ address: '0xa', locked: false, created_at: '', last_login_at: null, role: 'admin', wallets: 1, tasks: 1, positions_open: 0 }, { address: '0xb', locked: true, created_at: '', last_login_at: null, role: 'user', wallets: 0, tasks: 0, positions_open: 0 }])
  vi.mocked(adminApi.setSetting).mockResolvedValue(undefined)
})

it('shows metric cards, engine lag warning and errors', async () => {
  renderPage()
  expect(await screen.findByText('123.456789')).toBeInTheDocument() // 累计花费 USDG
  expect(screen.getByText('2')).toBeInTheDocument() // 用户数（来自用户列表）
  expect(screen.getByText('12 / 13')).toBeInTheDocument() // 运行中 / 任务数
  expect(screen.getByText('100 / 150')).toBeInTheDocument()
  expect(screen.getByText('落后 50 块')).toBeInTheDocument()
  expect(screen.getByText('unhealthy')).toBeInTheDocument()
  expect(screen.getByText('可用 operator')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})

it('toggles kill_switch with confirmation', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('switch', { name: '全局停止' }))
  expect(screen.getByText('确认打开全局停止？所有任务将停止跟单')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '确定' }))
  expect(adminApi.setSetting).toHaveBeenCalledWith('kill_switch', true)
})
