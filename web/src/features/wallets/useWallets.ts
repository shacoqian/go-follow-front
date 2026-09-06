import { useQuery, useQueryClient } from '@tanstack/react-query'
import { walletsApi } from '@/api/wallets'

export const walletKeys = { list: ['wallets'] as const }

export function useWallets() {
  return useQuery({ queryKey: walletKeys.list, queryFn: walletsApi.list, refetchInterval: 10_000 })
}

export function useInvalidateWallets() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: walletKeys.list })
}
