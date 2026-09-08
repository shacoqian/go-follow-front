import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { logs: vi.fn() } }))

import { ApiError } from '@/api/client'
import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import LogsPage from './LogsPage'

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LogsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('does not fetch until the query is submitted', () => {
  renderPage()
  expect(adminApi.logs).not.toHaveBeenCalled()
})

it('queries with the filled filters, renders rows, and expands extra fields on click', async () => {
  vi.mocked(adminApi.logs).mockResolvedValue({
    total: 2,
    files: ['gofollow.log', 'gofollow.log.1.gz'],
    entries: [
      {
        ts: '2026-09-08T08:41:24Z',
        level: 'WARN',
        module: 'engine',
        msg: '重试超时',
        caller: 'engine/run.go:10',
        task_id: 3,
        detail: { attempt: 2 },
      },
    ],
  })

  renderPage()
  await userEvent.type(screen.getByLabelText('关键字'), 'a,b')
  await userEvent.selectOptions(screen.getByLabelText('级别'), 'WARN')
  await userEvent.click(screen.getByRole('button', { name: '查询' }))

  expect(adminApi.logs).toHaveBeenLastCalledWith({
    q: 'a,b',
    level: 'WARN',
    from: undefined,
    to: undefined,
    limit: 100,
    dedup: undefined,
  })

  expect(await screen.findByText('重试超时')).toBeInTheDocument()
  expect(screen.getByText('engine')).toBeInTheDocument()
  expect(screen.getByText('WARN', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByText(/共/)).toHaveTextContent('共 2 条，扫描 2 个文件')
  expect(screen.getByTitle('按文件尾部有限扫描的匹配数')).toHaveTextContent('2')

  // 展开前看不到额外字段
  expect(screen.queryByText('task_id')).not.toBeInTheDocument()

  await userEvent.click(screen.getByText('重试超时'))
  expect(screen.getByText('task_id')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('detail')).toBeInTheDocument()
  expect(screen.getByText('{"attempt":2}')).toBeInTheDocument()
  // caller/ts/level/module/msg 不作为额外字段重复展示
  expect(screen.queryByText('caller')).not.toBeInTheDocument()

  // 再点一次收起
  await userEvent.click(screen.getByText('重试超时'))
  expect(screen.queryByText('task_id')).not.toBeInTheDocument()
})

it('shows an empty-result message', async () => {
  vi.mocked(adminApi.logs).mockResolvedValue({ total: 0, files: [], entries: [] })
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: '查询' }))
  expect(await screen.findByText('没有匹配的日志')).toBeInTheDocument()
})

it('shows a 400 error inline', async () => {
  vi.mocked(adminApi.logs).mockRejectedValue(new ApiError(400, 'limit 须在 1–500'))
  renderPage()
  await userEvent.clear(screen.getByLabelText('条数'))
  await userEvent.type(screen.getByLabelText('条数'), '9999')
  await userEvent.click(screen.getByRole('button', { name: '查询' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('limit 须在 1–500')
})

it('converts datetime-local inputs to RFC3339 on submit', async () => {
  vi.mocked(adminApi.logs).mockResolvedValue({ total: 0, files: [], entries: [] })
  renderPage()
  const from = screen.getByLabelText('开始时间')
  const to = screen.getByLabelText('结束时间')
  // datetime-local 用 fireEvent.change：userEvent.type 对该 input 类型在 jsdom 下不可靠
  fireEvent.change(from, { target: { value: '2026-09-08T08:00' } })
  fireEvent.change(to, { target: { value: '2026-09-08T10:00' } })
  await userEvent.click(screen.getByRole('button', { name: '查询' }))

  await waitFor(() => expect(adminApi.logs).toHaveBeenCalled())
  const call = vi.mocked(adminApi.logs).mock.calls[0][0]
  expect(call.from).toBe(new Date('2026-09-08T08:00').toISOString())
  expect(call.to).toBe(new Date('2026-09-08T10:00').toISOString())
})

it('sends only non-empty params for the default query', async () => {
  vi.mocked(adminApi.logs).mockResolvedValue({ total: 0, files: [], entries: [] })
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: '查询' }))
  expect(adminApi.logs).toHaveBeenLastCalledWith({
    q: undefined,
    level: undefined,
    from: undefined,
    to: undefined,
    limit: 100,
    dedup: undefined,
  })
})
