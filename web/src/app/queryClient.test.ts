import { createElement, type ReactNode } from 'react'
import { QueryClientProvider, useMutation } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { ApiError } from '@/api/client'
import { useToasts } from '@/components/ui/toast'
import { makeQueryClient } from './queryClient'

function wrapperFor(qc: ReturnType<typeof makeQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children)
  }
}

beforeEach(() => {
  useToasts.setState({ items: [] })
})

it('toasts once when a mutation rejects', async () => {
  const qc = makeQueryClient()
  const { result } = renderHook(() => useMutation({ mutationFn: () => Promise.reject(new ApiError(500, 'x')) }), {
    wrapper: wrapperFor(qc),
  })
  result.current.mutate()
  await waitFor(() => expect(useToasts.getState().items).toHaveLength(1))
  expect(useToasts.getState().items[0]).toMatchObject({ kind: 'error', message: 'x' })
})

it('does not toast when the mutation is marked meta.silent', async () => {
  const qc = makeQueryClient()
  const { result } = renderHook(
    () => useMutation({ mutationFn: () => Promise.reject(new ApiError(500, 'x')), meta: { silent: true } }),
    { wrapper: wrapperFor(qc) },
  )
  result.current.mutate()
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(useToasts.getState().items).toHaveLength(0)
})
