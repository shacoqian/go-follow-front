import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { users: vi.fn(), lockUser: vi.fn(), unlockUser: vi.fn() } }))

import { adminApi } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import UsersPage from './UsersPage'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.users).mockResolvedValue([
    { address: '0x8ba1f109551bd432803012645ac136ddd64dba72', locked: false, created_at: '2026-09-06T00:00:00Z', last_login_at: '2026-09-06T01:02:03Z', role: 'user', wallets: 2, tasks: 3, positions_open: 1 },
    { address: '0x0000000000000000000000000000000000000001', locked: true, created_at: '', last_login_at: null, role: 'admin', wallets: 0, tasks: 0, positions_open: 0 },
  ])
  vi.mocked(adminApi.lockUser).mockResolvedValue(undefined)
})

it('lists users, locks with confirmation, links to data page', async () => {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/admin/users']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/data" element={<div>数据页</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const row = (await screen.findByText('0x8ba1…ba72')).closest('tr')!
  expect(within(row).getByText('2')).toBeInTheDocument()
  expect(within(row).getByText('正常')).toBeInTheDocument()
  expect(within(row).getByText('普通用户')).toBeInTheDocument()
  expect(within(row).getByText('2026-09-06 01:02:03')).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('button', { name: '锁定' }))
  expect(screen.getByText('锁定后该用户无法登录，已在途的提现不受影响')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '确认锁定' }))
  expect(adminApi.lockUser).toHaveBeenCalledWith('0x8ba1f109551bd432803012645ac136ddd64dba72')
  const row2 = screen.getByText('0x0000…0001').closest('tr')!
  expect(within(row2).getByText('已锁定')).toBeInTheDocument()
  expect(within(row2).getByText('管理员')).toBeInTheDocument()
  expect(within(row2).getAllByText('—')).toHaveLength(2) // 最近登录 + 最近创建，均为空值
  expect(within(row2).getByRole('button', { name: '解锁' })).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('link', { name: '0x8ba1…ba72' }))
  expect(await screen.findByText('数据页')).toBeInTheDocument()
})
