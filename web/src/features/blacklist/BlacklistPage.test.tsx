import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/blacklist', () => ({ blacklistApi: { get: vi.fn(), put: vi.fn() } }))

import { ApiError } from '@/api/client'
import { blacklistApi } from '@/api/blacklist'
import { makeQueryClient } from '@/app/queryClient'
import { Toaster } from '@/components/ui/toast'
import BlacklistPage from './BlacklistPage'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BlacklistPage />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('loads existing addresses into the textarea', async () => {
  vi.mocked(blacklistApi.get).mockResolvedValue({ tokens: [A, B] })
  renderPage()
  const textarea = (await screen.findByRole('textbox')) as HTMLTextAreaElement
  await waitFor(() => expect(textarea.value).toBe(`${A}\n${B}`))
})

it('shows an inline error for an invalid line and does not call put', async () => {
  vi.mocked(blacklistApi.get).mockResolvedValue({ tokens: [A, B] })
  renderPage()
  const textarea = await screen.findByRole('textbox')
  await userEvent.clear(textarea)
  await userEvent.type(textarea, `${A}\nnope`)
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('第 2 行不是合法地址')
  expect(blacklistApi.put).not.toHaveBeenCalled()
})

it('saves deduped lowercase addresses and toasts success', async () => {
  vi.mocked(blacklistApi.get).mockResolvedValue({ tokens: [] })
  vi.mocked(blacklistApi.put).mockResolvedValue({ tokens: [A] })
  renderPage()
  const textarea = await screen.findByRole('textbox')
  await userEvent.clear(textarea)
  await userEvent.type(textarea, `${A.toUpperCase().replace('0X', '0x')}\n${A}`)
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(blacklistApi.put).toHaveBeenCalledWith([A])
  expect(await screen.findByText('黑名单已保存')).toBeInTheDocument()
})

it('shows the backend warning via toast.error', async () => {
  vi.mocked(blacklistApi.get).mockResolvedValue({ tokens: [] })
  vi.mocked(blacklistApi.put).mockResolvedValue({ tokens: [A], warning: '引擎黑名单缓存未刷新，请重试' })
  renderPage()
  const textarea = await screen.findByRole('textbox')
  await userEvent.clear(textarea)
  await userEvent.type(textarea, A)
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByText('引擎黑名单缓存未刷新，请重试')).toBeInTheDocument()
})

it('shows the ApiError message inline for an invalid address rejected by the backend', async () => {
  vi.mocked(blacklistApi.get).mockResolvedValue({ tokens: [] })
  vi.mocked(blacklistApi.put).mockRejectedValue(new ApiError(400, '非法地址: 0xzz'))
  renderPage()
  const textarea = await screen.findByRole('textbox')
  await userEvent.clear(textarea)
  await userEvent.type(textarea, A)
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('非法地址: 0xzz')
})
