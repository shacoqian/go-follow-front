import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/targets', () => ({ targetsApi: { list: vi.fn() } }))
vi.mock('@/api/wallets', () => ({ walletsApi: { list: vi.fn() } }))
vi.mock('@/api/tasks', () => ({ tasksApi: { list: vi.fn(), update: vi.fn() } }))

import { targetsApi } from '@/api/targets'
import { walletsApi } from '@/api/wallets'
import { tasksApi, type Task } from '@/api/tasks'
import { makeQueryClient } from '@/app/queryClient'
import TaskEditPage from './TaskEditPage'
import { defaultStrategy, toBackend } from './strategySchema'

const ids = { wallet_id: 1, target_id: 2 }
const task: Task = {
  id: 10,
  ...toBackend(defaultStrategy, ids),
  owner: '0xabc',
  enabled: true,
  spent_usdg: '0',
  consecutive_failures: 0,
  paused_reason: '',
  paused_at: null,
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tasks/:id/edit" element={<TaskEditPage />} />
          <Route path="/tasks" element={<div>任务列表</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(targetsApi.list).mockResolvedValue([])
  vi.mocked(walletsApi.list).mockResolvedValue([])
  vi.mocked(tasksApi.update).mockResolvedValue(undefined)
})

it('shows fromBackend defaults and saves with the merged strategy', async () => {
  vi.mocked(tasksApi.list).mockResolvedValue([task])
  renderAt('/tasks/10/edit')
  expect(await screen.findByLabelText('固定金额（USDG）')).toHaveValue('10')

  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(tasksApi.update).toHaveBeenCalledWith(10, toBackend(defaultStrategy, ids))
})

it('shows 任务不存在 when the task list has no matching id', async () => {
  vi.mocked(tasksApi.list).mockResolvedValue([])
  renderAt('/tasks/10/edit')
  expect(await screen.findByText('任务不存在')).toBeInTheDocument()
})

it('shows a loading state instead of 任务不存在 while the query is pending', () => {
  vi.mocked(tasksApi.list).mockReturnValue(new Promise(() => {}))
  renderAt('/tasks/10/edit')
  expect(screen.getByText('加载中…')).toBeInTheDocument()
  expect(screen.queryByText('任务不存在')).not.toBeInTheDocument()
})
