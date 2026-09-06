import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('@/wallets/okx', () => ({
  waitForOkx: vi.fn(),
  listAccounts: vi.fn(),
  onAccountsChanged: vi.fn(),
}))

import { listAccounts, onAccountsChanged, waitForOkx } from '@/wallets/okx'
import { useOkxAccounts } from './useOkxAccounts'

const A = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
const B = '0x1234567890123456789012345678901234567890'

beforeEach(() => {
  vi.clearAllMocks()
})

it('waits for OKX to inject before listing the authorized accounts', async () => {
  vi.mocked(waitForOkx).mockResolvedValue(true)
  vi.mocked(listAccounts).mockResolvedValue([A, B])
  vi.mocked(onAccountsChanged).mockReturnValue(() => {})

  const { result } = renderHook(() => useOkxAccounts())
  expect(result.current.accounts).toEqual([])

  await waitFor(() => expect(result.current.accounts).toEqual([A, B]))
  expect(result.current.current).toBe(A)
  expect(listAccounts).toHaveBeenCalledTimes(1)
})

it('never lists accounts when OKX never injects', async () => {
  vi.mocked(waitForOkx).mockResolvedValue(false)

  renderHook(() => useOkxAccounts())
  await waitFor(() => expect(waitForOkx).toHaveBeenCalled())
  expect(listAccounts).not.toHaveBeenCalled()
  expect(onAccountsChanged).not.toHaveBeenCalled()
})

it('re-lists the accounts whenever accountsChanged fires', async () => {
  vi.mocked(waitForOkx).mockResolvedValue(true)
  vi.mocked(listAccounts).mockResolvedValueOnce([A]).mockResolvedValueOnce([B])
  let handler: (accounts: string[]) => void = () => {}
  vi.mocked(onAccountsChanged).mockImplementation((cb) => {
    handler = cb
    return () => {}
  })

  const { result } = renderHook(() => useOkxAccounts())
  await waitFor(() => expect(result.current.accounts).toEqual([A]))

  act(() => handler([B]))
  await waitFor(() => expect(result.current.accounts).toEqual([B]))
  expect(listAccounts).toHaveBeenCalledTimes(2)
})

it('unsubscribes from accountsChanged on unmount', async () => {
  vi.mocked(waitForOkx).mockResolvedValue(true)
  vi.mocked(listAccounts).mockResolvedValue([A])
  const off = vi.fn()
  vi.mocked(onAccountsChanged).mockReturnValue(off)

  const { unmount } = renderHook(() => useOkxAccounts())
  await waitFor(() => expect(onAccountsChanged).toHaveBeenCalledTimes(1))

  unmount()
  expect(off).toHaveBeenCalledTimes(1)
})

it('refresh() re-lists the accounts on demand', async () => {
  vi.mocked(waitForOkx).mockResolvedValue(true)
  vi.mocked(listAccounts).mockResolvedValueOnce([A]).mockResolvedValueOnce([A, B])
  vi.mocked(onAccountsChanged).mockReturnValue(() => {})

  const { result } = renderHook(() => useOkxAccounts())
  await waitFor(() => expect(result.current.accounts).toEqual([A]))

  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.accounts).toEqual([A, B])
  expect(listAccounts).toHaveBeenCalledTimes(2)
})
