import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./auth', () => ({ loginWithOkx: vi.fn() }))
vi.mock('@/wallets/okx', () => ({ isOkxInstalled: vi.fn(() => true) }))

import { loginWithOkx } from './auth'
import { isOkxInstalled } from '@/wallets/okx'
import LoginPage from './LoginPage'

function renderAt(from?: string) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/login', state: from ? { from } : undefined }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/wallets" element={<div>钱包页</div>} />
        <Route path="/tasks" element={<div>任务页</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('shows the install hint when OKX is missing', () => {
  vi.mocked(isOkxInstalled).mockReturnValueOnce(false)
  renderAt()
  expect(screen.getByText(/未检测到 OKX 钱包/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /安装 OKX 钱包/ })).toHaveAttribute('href', 'https://www.okx.com/web3')
})

it('logs in and navigates back to where the user came from', async () => {
  vi.mocked(loginWithOkx).mockResolvedValueOnce({ token: 't', address: '0xabc', role: 'user', expiresAt: '' })
  renderAt('/tasks')
  await userEvent.click(screen.getByRole('button', { name: '连接 OKX 钱包' }))
  expect(await screen.findByText('任务页')).toBeInTheDocument()
})

it('shows the error message when login fails', async () => {
  vi.mocked(loginWithOkx).mockRejectedValueOnce(new Error('账号已被管理员锁定'))
  renderAt()
  await userEvent.click(screen.getByRole('button', { name: '连接 OKX 钱包' }))
  expect(await screen.findByText('账号已被管理员锁定')).toBeInTheDocument()
})
