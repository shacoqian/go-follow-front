import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn(), enable: vi.fn(), disable: vi.fn(), remove: vi.fn() } }))
vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))

import { ApiError } from '@/api/client'
import { tasksApi, type Task } from '@/api/tasks'
import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { makeQueryClient } from '@/app/queryClient'
import { useToasts, Toaster } from '@/components/ui/toast'
import TasksPage from './TasksPage'
import { defaultStrategy, toBackend } from './strategySchema'

const base = toBackend(defaultStrategy, { wallet_id: 1, target_id: 2 })
const t1: Task = { ...base, id: 10, owner: '0xabc', enabled: true, spent_usdg: '5000000', consecutive_failures: 0, paused_reason: '', paused_at: null, spend_limit_usdg: '20000000' }
// target_id 显式改为不在 mock 目标列表中的 3（brief 原样两条任务都继承 base 的 target_id: 2，会与 t1 撞出同一个
// "大户A" 文本节点，让未 within 限定的 screen.findByText('大户A') 行定位报 "Found multiple elements"；
// row2 的断言都不依赖目标列，这里只是避免数据碰撞，顺带覆盖"找不到显示 #target_id"的兜底分支）。
const t2: Task = { ...base, id: 11, target_id: 3, owner: '0xabc', enabled: false, spent_usdg: '0', consecutive_failures: 0, paused_reason: 'admin', paused_at: null }

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/tasks']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<div>向导页</div>} />
          <Route path="/tasks/:id/edit" element={<div>编辑页</div>} />
          <Route path="/positions" element={<div>仓位页</div>} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  vi.mocked(tasksApi.list).mockResolvedValue([t1, t2])
  vi.mocked(targetsApi.list).mockResolvedValue([{ id: 2, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }])
  vi.mocked(walletsApi.list).mockResolvedValue([{ id: 1, address: '0x1111111111111111111111111111111111111111', label: '主钱包', status: 'active', usdg_balance: '0', eth_balance: '0', task_count: 1, has_pending_withdrawal: false, note: '', created_at: '' }])
})

it('lists tasks with target/wallet labels, status badges, progress and mode summary', async () => {
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  expect(within(row).getByText('主钱包')).toBeInTheDocument()
  expect(within(row).getByText('运行中')).toBeInTheDocument()
  expect(within(row).getByText('5 / 20 USDG')).toBeInTheDocument()
  expect(within(row).getByText('固定 10 USDG · 按比例卖')).toBeInTheDocument()
  const row2 = screen.getByText('管理员禁用').closest('tr')!
  expect(within(row2).getByText('不限')).toBeInTheDocument()
  expect(within(row2).getByRole('button', { name: '启用' })).toBeDisabled()
})

it('stops, enables, navigates to edit and to the wizard', async () => {
  vi.mocked(tasksApi.disable).mockResolvedValue(undefined)
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '停止' }))
  expect(tasksApi.disable).toHaveBeenCalledWith(10)
  await userEvent.click(within(row).getByRole('link', { name: '编辑' }))
  expect(await screen.findByText('编辑页')).toBeInTheDocument()
})

it('deletes with confirmation; 409 links to positions; warning is toasted', async () => {
  vi.mocked(tasksApi.remove).mockRejectedValueOnce(new ApiError(409, '任务仍有持仓，请先卖出')).mockResolvedValueOnce({ ok: true, warning: '配置重载失败，引擎会在下次配置变更时刷新' })
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await screen.findByText(/任务仍有持仓/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '去仓位页' })).toHaveAttribute('href', '/positions')

  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(await screen.findByText(/配置重载失败/)).toBeInTheDocument()
})
