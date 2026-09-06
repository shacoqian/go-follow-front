import { useQuery, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'

export const taskKeys = { list: ['tasks'] as const }

export function useTasks() {
  return useQuery({ queryKey: taskKeys.list, queryFn: tasksApi.list, refetchInterval: 10_000 })
}

export function useInvalidateTasks() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: taskKeys.list })
}
