import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./auth', () => ({ loginWithOkx: vi.fn(), loginAs: vi.fn(), notePluginAccounts: vi.fn() }))
vi.mock('@/wallets/okx', () => ({
  isOkxInstalled: vi.fn(() => true),
  waitForOkx: vi.fn(async () => true),
  listAccounts: vi.fn(async () => []),
  onAccountsChanged: vi.fn(() => () => {}),
}))

import { loginAs, loginWithOkx } from './auth'
import { isOkxInstalled, listAccounts, onAccountsChanged } from '@/wallets/okx'
import LoginPage from './LoginPage'

const A = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
const B = '0x1234567890123456789012345678901234567890'

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isOkxInstalled).mockReturnValue(true)
  vi.mocked(listAccounts).mockResolvedValue([])
  vi.mocked(onAccountsChanged).mockReturnValue(() => {})
})

it('shows the install hint when OKX is missing', async () => {
  vi.mocked(isOkxInstalled).mockReturnValueOnce(false)
  renderAt()
  expect(screen.getByText(/未检测到 OKX 钱包/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /安装 OKX 钱包/ })).toHaveAttribute('href', 'https://www.okx.com/web3')
  // 等 useOkxAccounts 的首次异步刷新落地，避免 act() 警告溢出到下一个用例。
  await waitFor(() => expect(listAccounts).toHaveBeenCalled())
})

it('falls back to connect-and-login when there are no authorized accounts', async () => {
  vi.mocked(loginWithOkx).mockResolvedValueOnce({ token: 't', address: A.toLowerCase(), role: 'user', expiresAt: '' })
  renderAt('/tasks')
  await waitFor(() => expect(screen.queryByLabelText('账号')).not.toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: '连接 OKX 并登录' }))
  expect(loginWithOkx).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('任务页')).toBeInTheDocument()
})

it('shows the error message when connect-and-login fails', async () => {
  vi.mocked(loginWithOkx).mockRejectedValueOnce(new Error('账号已被管理员锁定'))
  renderAt()
  await waitFor(() => expect(screen.queryByLabelText('账号')).not.toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: '连接 OKX 并登录' }))
  expect(await screen.findByText('账号已被管理员锁定')).toBeInTheDocument()
})

it('preselects the current account, lets the user pick another, and signs in with it', async () => {
  vi.mocked(listAccounts).mockResolvedValue([A, B])
  vi.mocked(loginAs).mockResolvedValueOnce({ token: 't', address: B.toLowerCase(), role: 'user', expiresAt: '' })
  renderAt('/tasks')
  const select = await screen.findByLabelText('账号')
  await waitFor(() => expect(select).toHaveValue(A))
  await userEvent.selectOptions(select, B)
  await userEvent.click(screen.getByRole('button', { name: '以此账号登录' }))
  expect(loginAs).toHaveBeenCalledWith(B)
  expect(await screen.findByText('任务页')).toBeInTheDocument()
})

it('shows the error message when signing in with the selected account fails', async () => {
  vi.mocked(listAccounts).mockResolvedValue([A])
  vi.mocked(loginAs).mockRejectedValueOnce(new Error('用户拒绝签名'))
  renderAt()
  await screen.findByLabelText('账号')
  await userEvent.click(screen.getByRole('button', { name: '以此账号登录' }))
  expect(await screen.findByText('用户拒绝签名')).toBeInTheDocument()
})

it('refreshes the dropdown when accountsChanged drops the previously selected account', async () => {
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })
  vi.mocked(listAccounts).mockResolvedValueOnce([A, B]).mockResolvedValueOnce([B])
  renderAt()
  const select = await screen.findByLabelText('账号')
  await waitFor(() => expect(select).toHaveValue(A))
  handler([B])
  await waitFor(() => expect(select).toHaveValue(B))
})
