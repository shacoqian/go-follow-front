import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }))
vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn() } }))

import { ApiError } from '@/api/client'
import { targetsApi, type Target } from '@/api/targets'
import { tasksApi } from '@/api/tasks'
import { makeQueryClient } from '@/app/queryClient'
import { useToasts } from '@/components/ui/toast'
import TargetsPage from './TargetsPage'

const t1: Target = { id: 1, address: '0x2222222222222222222222222222222222222222', label: '大户A', note: '', created_at: '' }
function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TargetsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ items: [] })
  vi.mocked(targetsApi.list).mockResolvedValue([t1])
  vi.mocked(tasksApi.list).mockResolvedValue([{ id: 9, target_id: 1 } as never, { id: 10, target_id: 1 } as never])
})

it('lists targets with task counts', async () => {
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  expect(within(row).getByText('0x2222…2222')).toBeInTheDocument()
  expect(await within(row).findByText('2')).toBeInTheDocument()
})

it('validates the address and creates', async () => {
  vi.mocked(targetsApi.create).mockResolvedValue({ id: 2, address: '0x3333333333333333333333333333333333333333' })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '新增目标' }))
  await userEvent.type(screen.getByLabelText('地址'), 'not-an-address')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByText('地址格式不正确')).toBeInTheDocument()
  expect(targetsApi.create).not.toHaveBeenCalled()
  await userEvent.clear(screen.getByLabelText('地址'))
  await userEvent.type(screen.getByLabelText('地址'), '0x3333333333333333333333333333333333333333')
  await userEvent.type(screen.getByLabelText('标签'), '大户B')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(targetsApi.create).toHaveBeenCalledWith({ address: '0x3333333333333333333333333333333333333333', label: '大户B', note: '' })
})

it('edits and deletes, showing the 409 text', async () => {
  vi.mocked(targetsApi.update).mockResolvedValue(undefined)
  vi.mocked(targetsApi.remove).mockRejectedValue(new ApiError(409, '目标仍被任务引用: 2 个任务'))
  renderPage()
  const row = (await screen.findByText('大户A')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }))
  expect(screen.queryByLabelText('地址')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('备注'), '观察')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(targetsApi.update).toHaveBeenCalledWith(1, { label: '大户A', note: '观察' })

  await userEvent.click(within(row).getByRole('button', { name: '删除' }))
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
  // 409 时对话框必须先关掉：Radix 给背景打的 aria-hidden 会把提示条一起挡在无障碍树外。
  expect(await screen.findByText(/目标仍被任务引用/)).toBeVisible()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
