import { useQuery, useQueryClient } from '@tanstack/react-query'
import { targetsApi } from '@/api/targets'

export const targetKeys = { list: ['targets'] as const }

export function useTargets() {
  return useQuery({ queryKey: targetKeys.list, queryFn: targetsApi.list, refetchInterval: 10_000 })
}

export function useInvalidateTargets() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: targetKeys.list })
}
